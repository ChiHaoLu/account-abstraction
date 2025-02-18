// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/* solhint-disable avoid-low-level-calls */
/* solhint-disable no-inline-assembly */
/* solhint-disable reason-string */

import "@openzeppelin/contracts/utils/cryptography/P256.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "../core/BaseAccount.sol";
import "../core/Helpers.sol";
import "./callback/TokenCallbackHandler.sol";

/**
 * minimal account.
 *  this is sample minimal account.
 *  has execute, eth handling methods
 *  has a single signer that can send requests through the entryPoint.
 */
contract SimpleAccountInP256 is
    BaseAccount,
    TokenCallbackHandler,
    UUPSUpgradeable,
    Initializable
{
    uint256 public _ownerX;
    uint256 public _ownerY;
    bytes32 public _authenticatorRPIDHash;

    IEntryPoint private immutable _entryPoint;
    bool public _supportsNativeP256;

    event SimpleAccountInitialized(
        IEntryPoint indexed entryPoint,
        uint256 indexed ownerX,
        uint256 indexed ownerY,
        bytes32 authenticatorRPIDHash
    );

    modifier onlySelf() {
        _onlySelf();
        _;
    }

    function _onlySelf() internal view {
        require(
            msg.sender == address(this),
            "only through the account itself (which gets redirected through execute())"
        );
    }

    /// @inheritdoc BaseAccount
    function entryPoint() public view virtual override returns (IEntryPoint) {
        return _entryPoint;
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}

    constructor(IEntryPoint anEntryPoint, bool supportsNativeP256) {
        _entryPoint = anEntryPoint;
        _supportsNativeP256 = supportsNativeP256;
        _disableInitializers();
    }

    function initialize(
        uint256 ownerX,
        uint256 ownerY,
        bytes32 authenticatorRPIDHash
    ) public virtual initializer {
        _initialize(ownerX, ownerY, authenticatorRPIDHash);
    }

    function _initialize(
        uint256 ownerX,
        uint256 ownerY,
        bytes32 authenticatorRPIDHash
    ) internal virtual {
        _ownerX = ownerX;
        _ownerY = ownerY;
        _authenticatorRPIDHash = authenticatorRPIDHash;
        emit SimpleAccountInitialized(
            _entryPoint,
            ownerX,
            ownerY,
            authenticatorRPIDHash
        );
    }

    // Require the function call went through EntryPoint or owner
    function _requireForExecute() internal view virtual override {
        require(msg.sender == address(entryPoint()), "account: not EntryPoint");
    }

    // This function is for debugging instead of 1271 usage
    function isValidSignature(
        bytes32 hash,
        bytes memory signature
    ) public view returns (bool isValid) {
        require(signature.length == 64, "Invalid Signature: signature length");
        (bytes32 r, bytes32 s) = abi.decode(signature, (bytes32, bytes32));

        // P256 signer is a `(bytes32, bytes32)` coordinate
        bytes32 ownerX = bytes32(_ownerX);
        bytes32 ownerY = bytes32(_ownerY);

        if (_supportsNativeP256) {
            return P256.verifyNative(hash, r, s, ownerX, ownerY);
        } else {
            return P256.verifySolidity(hash, r, s, ownerX, ownerY);
        }
    }

    /// implement template method of BaseAccount
    function _validateSignature(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash
    ) internal virtual override returns (uint256 validationData) {
        return
            isValidSignature(userOpHash, userOp.signature)
                ? SIG_VALIDATION_FAILED
                : SIG_VALIDATION_SUCCESS;
    }

    /**
     * check current account deposit in the entryPoint
     */
    function getDeposit() public view returns (uint256) {
        return entryPoint().balanceOf(address(this));
    }

    /**
     * deposit more funds for this account in the entryPoint
     */
    function addDeposit() public payable {
        entryPoint().depositTo{value: msg.value}(address(this));
    }

    /**
     * withdraw value from the account's deposit
     * @param withdrawAddress target to send to
     * @param amount to withdraw
     */
    function withdrawDepositTo(
        address payable withdrawAddress,
        uint256 amount
    ) public onlySelf {
        entryPoint().withdrawTo(withdrawAddress, amount);
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal view override {
        (newImplementation);
        _onlySelf();
    }
}
