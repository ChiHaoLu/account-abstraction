import { ethers } from "hardhat";
import { toHex } from "hardhat/internal/util/bigint";
import { expect } from "chai";
import { p256 } from "@noble/curves/p256";

import { SimpleAccountInP256, EntryPoint } from "../typechain";
import { createAccountInP256, deployEntryPoint } from "./testutils";
import { JsonRpcProvider } from "@ethersproject/providers";
import { fillUserOpDefaults, getUserOpHash, packUserOp } from "./UserOp";
import { parseEther } from "ethers/lib/utils";
import { UserOperation } from "./UserOperation";

type P256Signer = {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  x: BigInt;
  y: BigInt;
  rpidHash: string;
};

describe("SimpleAccountInP256", function () {
  let entryPoint: EntryPoint;
  let accounts: string[];
  const privateKey = p256.utils.randomPrivateKey();
  const publicKey = p256.getPublicKey(privateKey);
  const point = p256.ProjectivePoint.fromPrivateKey(privateKey);
  const p256Signer: P256Signer = {
    privateKey: privateKey,
    publicKey: publicKey,
    x: point.x,
    y: point.y,
    rpidHash:
      "0x49960de5880e8c687434170f6476605b8fe4aeb9a28632c7995cf3ba831d9763",
  };
  const ethersSigner = ethers.provider.getSigner(); // perform as deployer and transaction operator (e.g., bundler)

  before(async function () {
    entryPoint = await deployEntryPoint();
    accounts = await ethers.provider.listAccounts();
    // ignore in geth.. this is just a sanity test. should be refactored to use a single-account mode..
    if (accounts.length < 2) this.skip();
  });

  describe("#validateUserOp w/ non native P256", () => {
    let account: SimpleAccountInP256;
    let accountAddress: string;
    let userOp: UserOperation;
    let userOpHash: string;

    before(async () => {
      const { proxy: account } = await createAccountInP256(
        ethers.provider.getSigner(),
        { x: p256Signer.x, y: p256Signer.y, rpidHash: p256Signer.rpidHash },
        entryPoint.address
      );
      expect(await account._entryPoint()).to.eql(entryPoint.address);
      expect(await account._ownerX()).to.eql(p256Signer.x);
      expect(await account._ownerY()).to.eql(p256Signer.y);
      accountAddress = account.address;

      await ethersSigner.sendTransaction({
        from: accounts[0],
        to: accountAddress,
        value: parseEther("0.2"),
      });
      const callGasLimit = 200000;
      const verificationGasLimit = 20000000;
      const maxFeePerGas = 3e9;
      const chainId = await ethers.provider
        .getNetwork()
        .then((net) => net.chainId);

      userOp = signUserOp(
        fillUserOpDefaults({
          sender: accountAddress,
          callGasLimit,
          verificationGasLimit,
          maxFeePerGas,
        }),
        p256Signer,
        entryPoint.address,
        chainId
      );

      userOpHash = getUserOpHash(userOp, entryPoint.address, chainId);

      const packedOp = packUserOp(userOp);
      const isValidSignature = await account.isValidSignature(
        userOpHash,
        userOp.signature
      );
      console.log("isValidSignature:", isValidSignature);
      expect(isValidSignature).to.eql(true);

      await (ethersSigner.provider as JsonRpcProvider).send(
        "hardhat_setBalance",
        [accountAddress, toHex(100e18)]
      );
      const ret = await entryPoint.handleOps([packedOp], accounts[0]);
      await ret.wait();
    });

    it("should ignore here  ", async () => {});
  });
});

export function signUserOp(
  op: UserOperation,
  p256Signer: P256Signer,
  entryPoint: string,
  chainId: number
): UserOperation {
  const messageHash = getUserOpHash(op, entryPoint, chainId);

  let { r, s } = p256.sign(
    messageHash.replace(/^0x/, ""),
    p256Signer.privateKey
  );
  if (s > p256.CURVE.n / 2n) {
    s = p256.CURVE.n - s;
  }
  const signature = new ethers.utils.AbiCoder().encode(
    ["(uint256, uint256)"],
    [[r, s]]
  );

  return {
    ...op,
    signature: signature,
  };
}
