import { ethers } from "hardhat";
import { expect } from "chai";
import { p256 } from "@noble/curves/p256";

import {
  SimpleAccountInP256,
  SimpleAccountInP256__factory,
  EntryPoint,
} from "../typechain";
import {
  HashZero,
  getBalance,
  createAccountInP256,
  deployEntryPoint,
} from "./testutils";
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

  describe("#validateUserOp", () => {
    let account: SimpleAccountInP256;
    let userOp: UserOperation;
    let userOpHash: string;
    let preBalance: number;
    let expectedPay: number;

    const actualGasPrice = 1e9;

    before(async () => {
      const { proxy: account } = await createAccountInP256(
        ethers.provider.getSigner(),
        { x: p256Signer.x, y: p256Signer.y, rpidHash: p256Signer.rpidHash },
        entryPoint.address
      );

      await ethersSigner.sendTransaction({
        from: accounts[0],
        to: account.address,
        value: parseEther("0.2"),
      });
      const callGasLimit = 200000;
      const verificationGasLimit = 100000;
      const maxFeePerGas = 3e9;
      const chainId = await ethers.provider
        .getNetwork()
        .then((net) => net.chainId);

      userOp = signUserOp(
        fillUserOpDefaults({
          sender: account.address,
          callGasLimit,
          verificationGasLimit,
          maxFeePerGas,
        }),
        p256Signer,
        entryPoint.address,
        chainId
      );

      userOpHash = getUserOpHash(userOp, entryPoint.address, chainId);

      expectedPay = actualGasPrice * (callGasLimit + verificationGasLimit);

      preBalance = await getBalance(account.address);
      const packedOp = packUserOp(userOp);
      const isValidSignature = await account.isValidSignature(
        userOpHash,
        userOp.signature
      );
      console.log(
        "Account Owner's PublicKey: ",
        await account._ownerX(),
        await account._ownerY()
      );
      console.log("isValidSignature:", isValidSignature);
      expect(isValidSignature).to.eql(true);

      const ret = await entryPoint.handleOps([packedOp], accounts[0]);
      await ret.wait();
    });

    it("should pay", async () => {
      const postBalance = await getBalance(account.address);
      expect(preBalance - postBalance).to.eql(expectedPay);
    });

    it("should return NO_SIG_VALIDATION on wrong signature", async () => {
      const userOpHash = HashZero;
      const packedOp = packUserOp(userOp);
      const deadline = await account.callStatic.validateUserOp(
        { ...packedOp, nonce: 1 },
        userOpHash,
        0
      );
      expect(deadline).to.eq(1);
    });
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
