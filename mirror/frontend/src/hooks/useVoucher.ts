import { ethers, Signer } from "ethers";
import { TypedDataDomain, TypedDataField } from "@ethersproject/abstract-signer";

const useVoucher = (contractAddress: string, contract: ethers.Contract | null, signer: Signer | null) => {

  const getDomain = async (): Promise<TypedDataDomain> => {
      if (!signer) throw new Error("Signer not connected");
      const network = await signer.provider?.getNetwork();
      const chainId = network?.chainId || 80002; // Default to Amoy
      return {
          name: "PolyMirrorChannel",
          version: "1",
          chainId: Number(chainId),
          verifyingContract: contractAddress,
      };
  }

  const types: Record<string, Array<TypedDataField>> = {
    Voucher: [
        { name: "channel", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "model", type: "string" },
        { name: "inputTokenAmount", type: "uint256" },
        { name: "maxOutputTokenAmount", type: "uint256" },
    ],
  };

  const signVoucher = async (model: string, inputTokenAmount: ethers.BigNumberish, maxOutputTokenAmount: ethers.BigNumberish) => {
    if (!signer || !contract) {
      throw new Error("Signer or contract not initialized");
    }

    const signerAddress = await signer.getAddress();
    const nonce = await contract.nonces(signerAddress);
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    const voucher = {
      channel: signerAddress,
      nonce: nonce,
      deadline: deadline,
      model: model,
      inputTokenAmount: inputTokenAmount,
      maxOutputTokenAmount: maxOutputTokenAmount,
    };

    const domain = await getDomain();

    const signature = await (signer as any)._signTypedData(domain, types, voucher);

    return { voucher, signature };
  };

  return { signVoucher };
};

export default useVoucher;
