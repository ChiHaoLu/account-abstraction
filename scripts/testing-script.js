// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const { p256 } = require("@noble/curves/p256");
const SimpleAccountInP256FactoryMetaData = require("../artifacts/contracts/accounts/SimpleAccountInP256Factory.sol/SimpleAccountInP256Factory.json");
const SimpleAccountInP256MetaData = require("../artifacts/contracts/accounts/SimpleAccountInP256.sol/SimpleAccountInP256.json");
const {
  fillUserOpDefaults,
  getUserOpHash,
  packUserOp,
} = require("../test/UserOp");

const EntryPointAddress = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // Get the deployer
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }

  // Deploy the account factory
  const SimpleAccountInP256Factory = new hre.ethers.ContractFactory(
    SimpleAccountInP256FactoryMetaData.abi,
    SimpleAccountInP256FactoryMetaData.bytecode,
    accounts[0]
  );
  const simpleAccountInP256FactoryWithNativeP256 =
    await SimpleAccountInP256Factory.deploy(EntryPointAddress, true);
  const simpleAccountInP256FactoryWithoutNativeP256 =
    await SimpleAccountInP256Factory.deploy(EntryPointAddress, false);

  await simpleAccountInP256FactoryWithNativeP256.deployed();
  await simpleAccountInP256FactoryWithoutNativeP256.deployed();

  console.log(
    "SimpleAccountInP256Factory w/ Native P256 Precompiled deployed to:",
    simpleAccountInP256FactoryWithNativeP256.address
  );
  console.log(
    "SimpleAccountInP256Factory w/out Native P256 Precompiled deployed to:",
    simpleAccountInP256FactoryWithoutNativeP256.address
  );

  // Create a new P256 signer
  const privateKey = p256.utils.randomPrivateKey();
  const publicKey = p256.getPublicKey(privateKey);
  const point = p256.ProjectivePoint.fromPrivateKey(privateKey);
  const p256Signer = {
    privateKey: privateKey,
    publicKey: publicKey,
    x: point.x,
    y: point.y,
    rpidHash:
      "0x49960de5880e8c687434170f6476605b8fe4aeb9a28632c7995cf3ba831d9763",
  };

  // Deploy the account
  await simpleAccountInP256FactoryWithNativeP256.createAccount(
    p256Signer.x,
    p256Signer.y,
    p256Signer.rpidHash,
    0
  );
  const simpleAccountWithNativeP256Address =
    await simpleAccountInP256FactoryWithNativeP256.getAddress(
      p256Signer.x,
      p256Signer.y,
      p256Signer.rpidHash,
      0
    );
  const simpleAccountWithNativeP256 = new hre.ethers.Contract(
    simpleAccountWithNativeP256Address,
    SimpleAccountInP256MetaData.abi,
    accounts[0]
  );

  await simpleAccountInP256FactoryWithoutNativeP256.createAccount(
    p256Signer.x,
    p256Signer.y,
    p256Signer.rpidHash,
    0
  );
  const simpleAccountWithoutNativeP256Address =
    await simpleAccountInP256FactoryWithoutNativeP256.getAddress(
      p256Signer.x,
      p256Signer.y,
      p256Signer.rpidHash,
      0
    );
  const simpleAccountWithoutNativeP256 = new hre.ethers.Contract(
    simpleAccountWithoutNativeP256Address,
    SimpleAccountInP256MetaData.abi,
    accounts[0]
  );

  // Test isValidSignature
  const randomHash = hre.ethers.utils.hashMessage("Hello");
  const signature = sign(randomHash, p256Signer);
  const isValidSignatureWithNativeP256 =
    await simpleAccountWithNativeP256.isValidSignature(randomHash, signature);
  const isValidSignatureWithoutNativeP256 =
    await simpleAccountWithoutNativeP256.isValidSignature(
      randomHash,
      signature
    );
  console.log(
    "isValidSignature w/ Native P256",
    isValidSignatureWithNativeP256
  );
  console.log(
    "isValidSignature w/out Native P256",
    isValidSignatureWithoutNativeP256
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

function sign(messageHash, p256Signer) {
  let { r, s } = p256.sign(
    messageHash.replace(/^0x/, ""),
    p256Signer.privateKey
  );
  if (s > p256.CURVE.n / 2n) {
    s = p256.CURVE.n - s;
  }
  return new hre.ethers.utils.AbiCoder().encode(
    ["(uint256, uint256)"],
    [[r, s]]
  );
}

function signUserOp(op, p256Signer, entryPoint, chainId) {
  const userOpHash = getUserOpHash(op, entryPoint, chainId);
  return {
    ...op,
    signature: sign(userOpHash, p256Signer),
  };
}
