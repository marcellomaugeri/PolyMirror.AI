import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { abi as contractAbi } from './abi.js';

// Define the type for our usage data items
interface UsageRecord {
  id: string;
  name: string; // Fallback for timestamp
  input: number;
  output: number;
  model: string;
  cost: string | null;
  timestamp: string; // Primary field for the date
  time?: number; // Add numeric time for charting
}

interface PricingData {
  polRate: number;
  models: {
    [key: string]: {
      inputUsd: number;
      outputUsd: number;
      inputPol: string;
      outputPol: string;
    }
  }
}

// Define the type for the window.ethereum object
interface Window {
  ethereum?: ethers.Eip1193Provider;
}
declare var window: Window;

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
const BACKEND_URL = 'http://localhost:3001';

// Helper to format address
const formatAddress = (address: string) => `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;

// Helper to format POL amount
const formatPol = (wei: ethers.BigNumberish) => ethers.formatEther(wei);

// Helper to format cost for display
const formatDisplayCost = (wei: ethers.BigNumberish) => {
  const pol = parseFloat(ethers.formatEther(wei));
  if (pol > 0 && pol < 0.01) {
    return '<0.01';
  }
  return pol.toFixed(4); // Show a bit more precision for clarity
};

// Custom Tooltip for the Chart
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const costInPol = data.cost ? formatPol(data.cost) : '0';
    return (
      <div className="custom-tooltip">
        <p className="label">{`Time : ${new Date(data.timestamp).toLocaleString()}`}</p>
        <p className="intro">{`Input Tokens : ${data.input}`}</p>
        <p className="intro">{`Output Tokens : ${data.output}`}</p>
        <p className="cost">{`Cost : ${data.cost ? `~${parseFloat(costInPol).toFixed(8)} POL` : 'N/A'}`}</p>
      </div>
    );
  }
  return null;
};

// Modal Component
const Modal = ({ children, onClose }) => (
  <div className="modal-overlay" onClick={onClose}>
    <div className="modal-content" onClick={e => e.stopPropagation()}>
      {children}
    </div>
  </div>
);

function App() {
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [channelBalance, setChannelBalance] = useState<string>('0');
  const [usageData, setUsageData] = useState<UsageRecord[]>([]);
  const [pricingData, setPricingData] = useState<PricingData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isTopUpModalOpen, setTopUpModalOpen] = useState(false);
  const [isWithdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('0.1');

  const connectWallet = useCallback(async () => {
    if (window.ethereum) {
      try {
        const browserProvider = new ethers.BrowserProvider(window.ethereum);
        await browserProvider.send('eth_requestAccounts', []);
        const currentSigner = await browserProvider.getSigner();
        const currentAccount = await currentSigner.getAddress();
        
        if (!CONTRACT_ADDRESS) {
          throw new Error("VITE_CONTRACT_ADDRESS is not set in the environment.");
        }

        const contractInstance = new ethers.Contract(CONTRACT_ADDRESS, contractAbi, currentSigner);

        setProvider(browserProvider);
        setSigner(currentSigner);
        setAccount(currentAccount);
        setContract(contractInstance);
        setError(null);
      } catch (err: any) {
        console.error("Failed to connect wallet:", err);
        setError(err.message || 'Failed to connect wallet.');
      }
    } else {
      setError('MetaMask is not installed. Please install it to use this app.');
    }
  }, []);

  const fetchChannelBalance = useCallback(async () => {
    if (contract && account) {
      try {
        const balance = await contract.channel(account);
        setChannelBalance(formatPol(balance));
      } catch (err) {
        console.error("Failed to fetch channel balance:", err);
      }
    }
  }, [contract, account]);

  const fetchUsageData = useCallback(async () => {
    if (!account) return;
    try {
      const response = await fetch(`${BACKEND_URL}/api/usage/${account}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data: UsageRecord[] = await response.json();

      // Process data: add numeric timestamp and sort oldest-first for correct chart rendering
      const processedData = data
        .map(record => ({
          ...record,
          time: new Date(record.timestamp).getTime(),
        }))
        .sort((a, b) => (a.time || 0) - (b.time || 0));

      setUsageData(processedData);
    } catch (err) {
      console.error("Failed to fetch usage data:", err);
    }
  }, [account]);

  const fetchPricingData = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/pricing`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data: PricingData = await response.json();
      setPricingData(data);
    } catch (err) {
      console.error("Failed to fetch pricing data:", err);
      // Do not set a user-facing error for this, as it's non-critical.
    }
  }, []);


  useEffect(() => {
    if (account && contract) {
      const initialFetch = () => {
        fetchChannelBalance();
        fetchUsageData();
        fetchPricingData();
      };
      initialFetch();

      const balanceInterval = setInterval(fetchChannelBalance, 5000);
      const usageInterval = setInterval(fetchUsageData, 3000);

      return () => {
        clearInterval(balanceInterval);
        clearInterval(usageInterval);
      };
    }
  }, [account, contract, fetchChannelBalance, fetchUsageData, fetchPricingData]);

  const handleTopUp = async () => {
    if (contract && topUpAmount) {
      try {
        setError(null);
        const value = ethers.parseEther(topUpAmount);
        const tx = await contract.topUpChannel({ value });
        await tx.wait();
        fetchChannelBalance();
        setTopUpModalOpen(false);
      } catch (err: any) {
        console.error("Top-up failed:", err);
        setError(err.reason || err.message || 'Top-up failed.');
      }
    }
  };

  const handleWithdraw = async () => {
    if (contract) {
      try {
        setError(null);
        const tx = await contract.withdrawChannel();
        await tx.wait();
        fetchChannelBalance(); // Should be 0 after withdrawal
        setWithdrawModalOpen(false);
      } catch (err: any) {
        console.error("Withdrawal failed:", err);
        setError(err.reason || err.message || 'Withdrawal failed.');
      }
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <img src="/logo_horizontal.png" alt="PolyMirror.AI Logo" className="header-logo" />
        {account ? (
          <div className="wallet-info">
            <button className="wallet-button connected">{formatAddress(account)}</button>
          </div>
        ) : (
          <button className="wallet-button" onClick={connectWallet}>Connect Wallet</button>
        )}
      </header>

      {error && <p className="error-message">{error}</p>}

      {account ? (
        <main className="dashboard">
          <div className="dashboard-grid">
            <div className="grid-item left-column">
              <div className="card channel-balance-card">
                <p>Channel Balance</p>
                <h3>{`${parseFloat(channelBalance).toFixed(4)} POL`}</h3>
                <div className="channel-actions">
                    <button className="top-up-btn" onClick={() => setTopUpModalOpen(true)}>Top-up</button>
                    <button className="withdraw-btn" onClick={() => setWithdrawModalOpen(true)}>Withdraw</button>
                </div>
              </div>
              <div className="card">
                <h2>History</h2>
                <div className="transaction-list">
                  <div className="transaction-header">
                    <span className="tx-model">Model & Time</span>
                    <span className="tx-tokens">Input/Output Tokens</span>
                    <span className="tx-cost">Cost (POL)</span>
                  </div>
                  {[...usageData].reverse().map((tx) => {
                    return (
                      <div className="transaction-item" key={tx.id}>
                        <div className="tx-info">
                          <span className="tx-model">{tx.model || 'gpt-4o-mini'}</span>
                          <span className="tx-time">{new Date(tx.timestamp || tx.name).toLocaleString()}</span>
                        </div>
                        <div className="tx-tokens">
                          <span>{tx.input}</span>
                          <span>/</span>
                          <span>{tx.output}</span>
                        </div>
                        {tx.cost ? (
                          <div className="tx-cost" title={`Exact: ${formatPol(tx.cost)} POL`}>
                            <span>~{formatDisplayCost(tx.cost)}</span>
                          </div>
                        ) : (
                          <div className="tx-cost" title="Cost not available">
                            <span>N/A</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid-item right-column">
              <div className="card">
                <h2>Usage Analytics</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={usageData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                    <XAxis 
                      dataKey="time"
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      tickFormatter={(unixTime) => new Date(unixTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      stroke="var(--on-background-color)"
                    />
                    <YAxis stroke="var(--on-background-color)" />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line type="monotone" dataKey="input" stroke="#8884d8" name="Input Tokens" dot={false} />
                    <Line type="monotone" dataKey="output" stroke="#82ca9d" name="Output Tokens" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="card">
                <h2>OpenAI Model Pricing</h2>
                {pricingData ? (
                  <div className="pricing-table">
                    <div className="pricing-header">
                      <span className="pricing-model">Model</span>
                      <span className="pricing-cost">Input Cost / 1M tokens</span>
                      <span className="pricing-cost">Output Cost / 1M tokens</span>
                    </div>
                    {Object.entries(pricingData.models).map(([model, prices]) => (
                      <div className="pricing-row" key={model}>
                        <span className="pricing-model">{model}</span>
                        <span className="pricing-cost" title={`$${prices.inputUsd}/1M`}>~{prices.inputPol} POL</span>
                        <span className="pricing-cost" title={`$${prices.outputUsd}/1M`}>~{prices.outputPol} POL</span>
                      </div>
                    ))}
                    <p className="pricing-rate-info">
                      Current Rate: 1 USD ≈ {pricingData.polRate} POL
                    </p>
                  </div>
                ) : (
                  <p>Loading pricing information...</p>
                )}
              </div>
            </div>
          </div>
        </main>
      ) : (
        <div className="connect-prompt">
          <h2>Please connect your wallet to view the dashboard.</h2>
        </div>
      )}

      {isTopUpModalOpen && (
        <Modal onClose={() => setTopUpModalOpen(false)}>
          <h2>Top-up Channel</h2>
          <p>Enter the amount of POL you want to add to your channel. This will be used to pay for your AI interactions.</p>
          <input 
            type="number" 
            className="modal-input"
            value={topUpAmount} 
            onChange={(e) => setTopUpAmount(e.target.value)} 
            step="0.1"
            min="0"
          />
          <div className="modal-actions">
            <button className="btn-cancel" onClick={() => setTopUpModalOpen(false)}>Cancel</button>
            <button className="btn-confirm" onClick={handleTopUp}>Confirm Top-up</button>
          </div>
        </Modal>
      )}

      {isWithdrawModalOpen && (
        <Modal onClose={() => setWithdrawModalOpen(false)}>
          <h2>Withdraw Funds & Close Channel</h2>
          <p>This action will close your payment channel and withdraw all remaining funds ({channelBalance} POL) back to your wallet. You will need to create a new channel by topping up again if you wish to continue using the service.</p>
          <div className="modal-actions">
            <button className="btn-cancel" onClick={() => setWithdrawModalOpen(false)}>Cancel</button>
            <button className="btn-danger" onClick={handleWithdraw}>Confirm & Withdraw</button>
          </div>
        </Modal>
      )}

    </div>
  );
}

export default App;
