require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    // localhost: {
    //   url: "http://127.0.0.1:8545",
    //   chainId: 31337,
    // },
    fluent_devnet: {
      url: "https://rpc.dev.gblend.xyz/",
      chainId: 20993,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    apiKey: {
      fluent_devnet: "dummy", // Not needed for Fluent devnet
    },
    customChains: [
      {
        network: "fluent_devnet",
        chainId: 20993,
        urls: {
          apiURL: "https://blockscout.dev.gblend.xyz/api",
          browserURL: "https://blockscout.dev.gblend.xyz",
        },
      },
    ],
  },
};
