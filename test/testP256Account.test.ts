import { ethers } from "hardhat";
import { expect } from "chai";
import { p256 } from "@noble/curves/p256";

import {
  ERC1967Proxy__factory,
  SimpleAccountInP256,
  SimpleAccountInP256__factory,
} from "../typechain";
import { HashZero, getBalance } from "./testutils";
import { fillUserOpDefaults, getUserOpHash, packUserOp } from "./UserOp";
import { parseEther, hexlify } from "ethers/lib/utils";
import { UserOperation } from "./UserOperation";

type P256Signer = {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  x: BigInt;
  y: BigInt;
  rpidHash: string;
};

describe("SimpleAccountInP256", function () {
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
    // for testing directly validateUserOp, we initialize the account with EOA as entryPoint.
    let entryPointEoa: string;

    before(async () => {
      entryPointEoa = accounts[2];
      const epAsSigner = await ethers.getSigner(entryPointEoa);

      // cant use "SimpleAccountInP256Factory", since it attempts to increment nonce first
      const implementation = await new SimpleAccountInP256__factory(
        ethersSigner
      ).deploy(entryPointEoa, false);
      const proxy = await new ERC1967Proxy__factory(ethersSigner).deploy(
        implementation.address,
        "0x"
      );
      account = SimpleAccountInP256__factory.connect(proxy.address, epAsSigner);

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
        entryPointEoa,
        chainId
      );

      userOpHash = await getUserOpHash(userOp, entryPointEoa, chainId);

      expectedPay = actualGasPrice * (callGasLimit + verificationGasLimit);

      preBalance = await getBalance(account.address);
      const packedOp = packUserOp(userOp);
      const ret = await account.validateUserOp(
        packedOp,
        userOpHash,
        expectedPay,
        { gasPrice: actualGasPrice }
      );
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
