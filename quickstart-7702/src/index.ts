import { createPublicClient, createWalletClient, Hex, http, zeroAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { eip7702Actions } from 'viem/experimental'
import { getEntryPoint, KERNEL_V3_1, KernelVersionToAddressesMap } from "@zerodev/sdk/constants"
import { signerToEcdsaValidator } from '@zerodev/ecdsa-validator'
import { createKernelAccount, createKernelAccountClient, createZeroDevPaymasterClient, getUserOperationGasPrice } from '@zerodev/sdk'
import * as dotenv from 'dotenv';

dotenv.config();

const {
  PROJECT_ID,
  PRIVATE_KEY,
} = process.env;

const PAYMASTER_RPC = `https://rpc.zerodev.app/api/v2/paymaster/${PROJECT_ID}?selfFunded=true`
const BUNDLER_RPC = `https://rpc.zerodev.app/api/v2/bundler/${PROJECT_ID}`

/**
 * 7702の検証用スクリプト
 */
const main = async () => {
  // set kernel version
  const kernelVersion = KERNEL_V3_1

  // create signer
  const signer = privateKeyToAccount(PRIVATE_KEY as Hex)
  const chain = sepolia
  console.log("EOA Address:", signer.address)
  const entryPoint = getEntryPoint("0.7")

  // create wallet client
  const walletClient = createWalletClient({
    chain,
    account: signer,
    transport: http(),
  }).extend(eip7702Actions())

  // create authorization
  const authorization = await walletClient.signAuthorization({
    contractAddress: KernelVersionToAddressesMap[kernelVersion].accountImplementationAddress,
    delegate: true,
  });

  console.log("Authorization:", authorization);

  // create public client
  const publicClient = createPublicClient({
    chain,
    transport: http(),
  })

  // create ecdsa validator
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
    entryPoint,
    kernelVersion,
  })

  // create kernel account
  const account = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
    },
    entryPoint,
    kernelVersion,
    // Set the 7702 authorization
    eip7702Auth: authorization,
    // Set the address of the smart account to the EOA address
    address: signer.address,
  })

  // create paymaster client
  const paymasterClient = createZeroDevPaymasterClient({
    chain,
    transport: http(PAYMASTER_RPC),
  })

  // create kernel client instance
  const kernelClient = createKernelAccountClient({
    account,
    chain,
    bundlerTransport: http(BUNDLER_RPC),
    paymaster: paymasterClient,
    client: publicClient,
    userOperation: {
      estimateFeesPerGas: async ({ bundlerClient }) => {
        return getUserOperationGasPrice(bundlerClient);
      },
    },
  });

  console.log("KernelClient Address:", await kernelClient.account.getAddress());

  // send user operation
  const userOpHash = await kernelClient.sendUserOperation({
    callData: await kernelClient.account.encodeCalls([
      {
        to: zeroAddress,
        value: BigInt(0),
        data: "0x",
      },
      {
        to: zeroAddress,
        value: BigInt(0),
        data: "0x",
      },
    ]),
  })

  // wait for user operation receipt
  const { receipt } = await kernelClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  console.log(
    "UserOp completed",
    `${chain.blockExplorers.default.url}/tx/${receipt.transactionHash}`
  );

  process.exit(0);
}


main();
