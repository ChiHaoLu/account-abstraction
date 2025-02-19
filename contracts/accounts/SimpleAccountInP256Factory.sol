// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/utils/Create2.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import "./SimpleAccountInP256.sol";

/**
 * A sample factory contract for SimpleAccount
 * A UserOperations "initCode" holds the address of the factory, and a method call (to createAccount, in this sample factory).
 * The factory's createAccount returns the target account address even if it is already installed.
 * This way, the entryPoint.getSenderAddress() can be called either before or after the account is created.
 */
contract SimpleAccountInP256Factory {
    SimpleAccountInP256 public immutable accountImplementation;

    constructor(address _entryPoint, bool _supportsNativeP256) {
        accountImplementation = new SimpleAccountInP256(
            IEntryPoint(_entryPoint),
            _supportsNativeP256
        );
        emit FactoryDeployed(_entryPoint, _supportsNativeP256);
    }

    event FactoryDeployed(
        address indexed entryPoint,
        bool indexed supportsNativeP256
    );

    /**
     * create an account, and return its address.
     * returns the address even if the account is already deployed.
     * Note that during UserOperation execution, this method is called only if the account is not deployed.
     * This method returns an existing account address so that entryPoint.getSenderAddress() would work even after account creation
     */
    function createAccount(
        uint256 ownerX,
        uint256 ownerY,
        bytes32 authenticatorRPIDHash,
        uint256 salt
    ) public returns (SimpleAccountInP256 ret) {
        address addr = getAddress(ownerX, ownerY, authenticatorRPIDHash, salt);
        uint256 codeSize = addr.code.length;
        if (codeSize > 0) {
            return SimpleAccountInP256(payable(addr));
        }
        ret = SimpleAccountInP256(
            payable(
                new ERC1967Proxy{salt: bytes32(salt)}(
                    address(accountImplementation),
                    abi.encodeCall(
                        SimpleAccountInP256.initialize,
                        (ownerX, ownerY, authenticatorRPIDHash)
                    )
                )
            )
        );
    }

    /**
     * calculate the counterfactual address of this account as it would be returned by createAccount()
     */
    function getAddress(
        uint256 ownerX,
        uint256 ownerY,
        bytes32 authenticatorRPIDHash,
        uint256 salt
    ) public view returns (address) {
        return
            Create2.computeAddress(
                bytes32(salt),
                keccak256(
                    abi.encodePacked(
                        type(ERC1967Proxy).creationCode,
                        abi.encode(
                            address(accountImplementation),
                            abi.encodeCall(
                                SimpleAccountInP256.initialize,
                                (ownerX, ownerY, authenticatorRPIDHash)
                            )
                        )
                    )
                )
            );
    }
}
