import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { abi as contractAbi } from './abi.js';

// For Vite, environment variables must be prefixed with VITE_
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
const BACKEND_URL = 'http://localhost:3001';

// --- DEBUGGING --- 
console.log('VITE_CONTRACT_ADDRESS as seen by Vite:', CONTRACT_ADDRESS);
// --- END DEBUGGING ---

function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);
  const [contract, setContract] = useState(null);
  const [channelBalance, setChannelBalance] = useState('0');
  const [topUpAmount, setTopUpAmount] = useState('0.1');
  const [usageData, setUsageData] = useState([]);
  const [error, setError] = useState(null);

  const connectWallet = useCallback(async () => {
    if (window.ethereum) {
      try {
        const browserProvider = new ethers.BrowserProvider(window.ethereum);
        await browserProvider.send('eth_requestAccounts', []);
        const currentSigner = await browserProvider.getSigner();
        const currentAccount = await currentSigner.getAddress();
        
        if (!CONTRACT_ADDRESS) {
          throw new Error("Contract address is not available. Please check your .env file and Vite configuration.");
        }

        const contractInstance = new ethers.Contract(CONTRACT_ADDRESS, contractAbi, currentSigner);

        setProvider(browserProvider);
        setSigner(currentSigner);
        setAccount(currentAccount);
        setContract(contractInstance);
        setError(null);
      } catch (err) {
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
        setChannelBalance(ethers.formatEther(balance));
      } catch (err) {
        console.error("Failed to fetch channel balance:", err);
      }
    }
  }, [contract, account]);

  const fetchUsageData = useCallback(async () => {
    if (!account) return;
    try {
      const response = await fetch(`${BACKEND_URL}/api/usage/${account}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      // Simple chart data preparation
      const chartData = data.map((item, index) => ({
        name: `Tx ${index + 1}`,
        ...item
      }));
      setUsageData(chartData);
    } catch (err) {
      console.error("Failed to fetch usage data:", err);
    }
  }, [account]);

  useEffect(() => {
    if (account && contract) {
      fetchChannelBalance();
      fetchUsageData();
      const interval = setInterval(() => {
        fetchChannelBalance();
        fetchUsageData();
      }, 5000); // Poll every 5 seconds
      return () => clearInterval(interval);
    }
  }, [account, contract, fetchChannelBalance, fetchUsageData]);

  const handleTopUp = async () => {
    if (contract && topUpAmount) {
      try {
        setError(null);
        const value = ethers.parseEther(topUpAmount);
        const tx = await contract.topUpChannel({ value });
        await tx.wait();
        fetchChannelBalance();
      } catch (err) {
        console.error("Top-up failed:", err);
        setError(err.reason || err.message || 'Top-up failed.');
      }
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>PolyMirror.AI Channel</h1>
        <button onClick={connectWallet} disabled={!!account}>
          {account ? `Connected: ${account.substring(0, 6)}...${account.substring(38)}` : 'Connect Wallet'}
        </button>
      </header>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {account && (
        <div>
          <h2>Channel Management</h2>
          <p>Your Address: {account}</p>
          <p>Channel Balance: {channelBalance} POL</p>
          <div>
            <input 
              type="text" 
              value={topUpAmount} 
              onChange={(e) => setTopUpAmount(e.target.value)} 
            />
            <button onClick={handleTopUp}>Top-up Channel</button>
          </div>
          <hr />
          <h2>Usage Data</h2>
          <div style={{ width: '100%', height: 300, backgroundColor: '#f0f0f0', overflowX: 'auto', display: 'flex', alignItems: 'flex-end' }}>
            {usageData.map((entry, index) => (
              <div key={index} style={{ width: '50px', margin: '0 5px', textAlign: 'center' }}>
                <div style={{ height: `${(entry.input + entry.output) / 10}px`, backgroundColor: '#8884d8', marginBottom: '5px' }}></div>
                <span>{entry.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
