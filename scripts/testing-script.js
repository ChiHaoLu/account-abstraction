const hre = require("hardhat");
const readline = require("readline");
const { p256 } = require("@noble/curves/p256");
const EntryPointMetaData = require("../artifacts/contracts/core/EntryPoint.sol/EntryPoint.json");
const SimpleAccountInP256FactoryMetaData = require("../artifacts/contracts/accounts/SimpleAccountInP256Factory.sol/SimpleAccountInP256Factory.json");
const SimpleAccountInP256MetaData = require("../artifacts/contracts/accounts/SimpleAccountInP256.sol/SimpleAccountInP256.json");
const { fillUserOpDefaults, packUserOp } = require("../test/UserOp");

const EntryPointAddress = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const injectEthFromOperator = true;

const { config } = require("dotenv");
config();

async function main() {
  // Get the deployer
  const accounts = await hre.ethers.getSigners(); // accounts[0] is the operator and deployer
  const chainId = await accounts[0].getChainId();
  const entryPoint = new hre.ethers.Contract(
    EntryPointAddress,
    EntryPointMetaData.abi,
    accounts[0]
  );

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
    "\nSimpleAccountInP256Factory w/ Native P256 Precompiled deployed to:",
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
  console.log(
    "\nSimpleAccountInP256 w/ Native P256 Precompiled deployed to:",
    simpleAccountWithNativeP256Address
  );
  console.log(
    "SimpleAccountInP256 w/out Native P256 Precompiled deployed to:",
    simpleAccountWithoutNativeP256Address
  );

  // Test isValidSignature
  const isValidSignatureDirectlyWithNativeP256 = await accounts[0].call({
    to: "0x0000000000000000000000000000000000000100",
    data: "0x4cee90eb86eaa050036147a12d49004b6b9c72bd725d39d4785011fe190f0b4da73bd4903f0ce3b639bbbf6e8e80d16931ff4bcf5993d58468e8fb19086e8cac36dbcd03009df8c59286b162af3bd7fcc0450c9aa81be5d10d312af6c66b1d604aebd3099c618202fcfe16ae7770b0c49ab5eadf74b754204a3bb6060e44eff37618b065f9832de4ca6ca971a7a1adc826d0f7c00181a5fb2ddf79ae00b4e10e",
  });
  console.log(
    "\nisValidSignature directly w/ P256 Precompiled",
    isValidSignatureDirectlyWithNativeP256
  );

  // Build the user operation
  const callGasLimit = 20_000;
  const verificationGasLimit = 2_000_000;
  const preVerificationGas = 50_000;
  const maxFeePerGas = 210_000_000;
  const maxPriorityFeePerGas = 6_000_000;
  let userOpWithNativeP256 = fillUserOpDefaults({
    sender: simpleAccountWithNativeP256Address,
    callGasLimit,
    verificationGasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas,
    preVerificationGas,
  });
  let userOpWithoutNativeP256 = fillUserOpDefaults({
    sender: simpleAccountWithoutNativeP256Address,
    callGasLimit,
    verificationGasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas,
    preVerificationGas,
  });
  userOpWithNativeP256 = signUserOp(
    packUserOp(userOpWithNativeP256),
    p256Signer,
    EntryPointAddress,
    chainId
  );
  userOpWithoutNativeP256 = signUserOp(
    packUserOp(userOpWithoutNativeP256),
    p256Signer,
    EntryPointAddress,
    chainId
  );
  console.log(
    "\nuserOp.signature isValidSignature w/ Native P256",
    await simpleAccountWithNativeP256.isValidSignature(
      getUserOpHash(userOpWithNativeP256, EntryPointAddress, chainId),
      userOpWithNativeP256.signature
    )
  );
  console.log(
    "userOp.signature isValidSignature w/out Native P256",
    await simpleAccountWithoutNativeP256.isValidSignature(
      getUserOpHash(userOpWithoutNativeP256, EntryPointAddress, chainId),
      userOpWithoutNativeP256.signature
    )
  );

  // Inject the ETH to sender address
  if (injectEthFromOperator) {
    await accounts[0].sendTransaction({
      to: simpleAccountWithNativeP256Address,
      value: hre.ethers.utils.parseEther("0.001"),
    });
    await accounts[0].sendTransaction({
      to: simpleAccountWithoutNativeP256Address,
      value: hre.ethers.utils.parseEther("0.001"),
    });
  } else {
    await waitForDeposit(simpleAccountWithNativeP256Address);
    await waitForDeposit(simpleAccountWithoutNativeP256Address);
  }

  // Test the handleOps directly w/out bundler
  const isValidUserOpWithNativeP256 = await entryPoint.callStatic.handleOps(
    [userOpWithNativeP256],
    accounts[0].address
  );
  console.log(
    "isValidUserOp w/ Native P256 through handleOps w/out bundler",
    isValidUserOpWithNativeP256
  );
  const isValidUserOpWithoutNativeP256 = await entryPoint.callStatic.handleOps(
    [userOpWithoutNativeP256],
    accounts[0].address
  );
  console.log(
    "isValidUserOp w/out Native P256 through handleOps w/out bundler",
    isValidUserOpWithoutNativeP256
  );

  // eth_estimateUserOperationGas
  const bundlerUserOpWithoutNativeP256 = unpackUserOp(userOpWithoutNativeP256);
  console.log(bundlerUserOpWithoutNativeP256);
  await fetch(
    `https://arb-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "eth_estimateUserOperationGas",
        params: [bundlerUserOpWithoutNativeP256, EntryPointAddress],
      }),
    }
  )
    .then((res) => res.json())
    .then((res) => console.log(res))
    .catch((err) => console.error(err));

  const bundlerUserOpWithNativeP256 = unpackUserOp(userOpWithNativeP256);
  console.log(bundlerUserOpWithNativeP256);
  await fetch(
    `https://arb-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "eth_estimateUserOperationGas",
        params: [bundlerUserOpWithNativeP256, EntryPointAddress],
      }),
    }
  )
    .then((res) => res.json())
    .then((res) => console.log(res))
    .catch((err) => console.error(err));
}

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

function waitForDeposit(accountAddress) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(
      `Please deposit at least 0.001 ETH in your entry address: ${accountAddress}. \n After deposit, please press Enter.`,
      (ans) => {
        rl.close();
        resolve(ans);
      }
    )
  );
}

function getUserOpHash(userOp, entryPoint, chainId) {
  const packedUserOp = new ethers.utils.AbiCoder().encode(
    [
      "address",
      "uint256",
      "bytes32",
      "bytes32",
      "bytes32",
      "uint256",
      "bytes32",
      "bytes32",
    ],
    [
      userOp.sender,
      userOp.nonce,
      hre.ethers.utils.keccak256(userOp.initCode),
      hre.ethers.utils.keccak256(userOp.callData),
      userOp.accountGasLimits,
      userOp.preVerificationGas,
      userOp.gasFees,
      hre.ethers.utils.keccak256(userOp.paymasterAndData),
    ]
  );
  const encodedUserOp = new ethers.utils.AbiCoder().encode(
    ["bytes32", "address", "uint256"],
    [hre.ethers.utils.keccak256(packedUserOp), entryPoint, BigInt(chainId)]
  );
  return hre.ethers.utils.keccak256(encodedUserOp);
}

function unpackInitCode(initCode) {
  if (initCode === "0x") {
    return {
      factory: "0x",
      factoryData: "0x",
    };
  }
  return {
    factory: `0x${initCode.substring(2, 42)}`,
    factoryData: `0x${initCode.substring(42)}`,
  };
}

function unpackAccountGasLimits(accountGasLimits) {
  return {
    verificationGasLimit: parseInt(
      `0x${accountGasLimits.substring(2, 34)}`,
      16
    ),
    callGasLimit: parseInt(`0x${accountGasLimits.substring(2, 34)}`, 16),
  };
}

function unpackGasFees(gasFees) {
  return {
    maxPriorityFeePerGas: parseInt(`0x${gasFees.substring(2, 34)}`, 16),
    maxFeePerGas: parseInt(`0x${gasFees.substring(34)}`, 16),
  };
}

function unpackPaymasterAndData(paymasterAndData) {
  if (!paymasterAndData || paymasterAndData === "0x") {
    return {
      paymaster: "0x",
      paymasterVerificationGasLimit: 0,
      paymasterPostOpGasLimit: 0,
      paymasterData: "0x",
    };
  }
  const paymaster = `0x${paymasterAndData.substring(2, 42)}`;
  const data = `0x${paymasterAndData.substring(42)}`;

  return {
    paymaster: paymaster,
    paymasterVerificationGasLimit: parseInt(`0x${data.substring(2, 34)}`, 16),
    paymasterPostOpGasLimit: parseInt(`0x${data.substring(34, 66)}`, 16),
    paymasterData: `0x${data.substring(66)}`,
  };
}

function unpackUserOp(userOp) {
  return {
    sender: userOp.sender,
    nonce: hre.ethers.utils.hexlify(userOp.nonce),
    callData: userOp.callData,
    ...(unpackInitCode(userOp.initCode).factory !== "0x" && {
      factory: unpackInitCode(userOp.initCode).factory,
      factoryData: unpackInitCode(userOp.initCode).factoryData,
    }),
    callGasLimit: hre.ethers.utils.hexlify(
      unpackAccountGasLimits(userOp.accountGasLimits).callGasLimit
    ),
    verificationGasLimit: hre.ethers.utils.hexlify(
      unpackAccountGasLimits(userOp.accountGasLimits).verificationGasLimit
    ),
    preVerificationGas: hre.ethers.utils.hexlify(userOp.preVerificationGas),
    maxFeePerGas: hre.ethers.utils.hexlify(
      unpackGasFees(userOp.gasFees).maxFeePerGas
    ),
    maxPriorityFeePerGas: hre.ethers.utils.hexlify(
      unpackGasFees(userOp.gasFees).maxPriorityFeePerGas
    ),
    paymasterVerificationGasLimit: hre.ethers.utils.hexlify(
      unpackPaymasterAndData(userOp.paymasterAndData)
        .paymasterVerificationGasLimit
    ),
    paymasterPostOpGasLimit: hre.ethers.utils.hexlify(
      unpackPaymasterAndData(userOp.paymasterAndData).paymasterPostOpGasLimit
    ),
    ...(unpackPaymasterAndData(userOp.paymasterAndData).paymaster !== "0x" && {
      paymaster: unpackPaymasterAndData(userOp.paymasterAndData).paymaster,
      paymasterData: unpackPaymasterAndData(userOp.paymasterAndData)
        .paymasterData,
    }),
    signature: userOp.signature,
  };
}
