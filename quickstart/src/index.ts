import { createKernelAccount, createKernelAccountClient, createZeroDevPaymasterClient, getUserOperationGasPrice } from "@zerodev/sdk"
import { KERNEL_V3_1, getEntryPoint } from "@zerodev/sdk/constants"
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"
import { http, createPublicClient, zeroAddress } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { baseSepolia } from "viem/chains"

const PROJECT_ID = 'c5c1e190-8845-40e9-b6b8-9ec3fadc4e8f'
const BUNDLER_RPC = `https://rpc.zerodev.app/api/v2/bundler/${PROJECT_ID}`
const PAYMASTER_RPC = `https://rpc.zerodev.app/api/v2/paymaster/${PROJECT_ID}`

const chain = baseSepolia
const entryPoint = getEntryPoint("0.7")
const kernelVersion = KERNEL_V3_1

/**
 * クイックスタート用のサンプルコード
 */
const main = async () => {
  // Construct a signer
  const privateKey = generatePrivateKey()
  const signer = privateKeyToAccount(privateKey)

  // Construct a public client
  const publicClient = createPublicClient({
    // Use your own RPC provider in production (e.g. Infura/Alchemy).
    transport: http(BUNDLER_RPC),
    chain
  })

  // Construct a validator
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
    entryPoint,
    kernelVersion
  })

  // Construct a Kernel account
  const account = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
    },
    entryPoint,
    kernelVersion
  })

  const zerodevPaymaster = createZeroDevPaymasterClient({
    chain,
    transport: http(PAYMASTER_RPC),
  })

  // Construct a Kernel account client
  const kernelClient = createKernelAccountClient({
    account,
    chain,
    bundlerTransport: http(BUNDLER_RPC),
    // Required - the public client
    client: publicClient,
    paymaster: {
        getPaymasterData(userOperation) {
            return zerodevPaymaster.sponsorUserOperation({userOperation})
        }
    },

    // Required - the default gas prices might be too high
    userOperation: {
      estimateFeesPerGas: async ({bundlerClient}) => {
          return getUserOperationGasPrice(bundlerClient)
      }
    }
  })

  const accountAddress = kernelClient.account.address
  console.log("My account:", accountAddress)

  // Send a UserOp
  const userOpHash = await kernelClient.sendUserOperation({
      callData: await kernelClient.account.encodeCalls([{
        to: zeroAddress,
        value: BigInt(0),
        data: "0x",
      }]),
  })

  console.log("UserOp hash:", userOpHash)
  console.log("Waiting for UserOp to complete...")

  await kernelClient.waitForUserOperationReceipt({
    hash: userOpHash,
    timeout: 1000 * 15,
  })

  console.log("UserOp completed: https://base-sepolia.blockscout.com/op/" + userOpHash)

  process.exit()
}

main()
