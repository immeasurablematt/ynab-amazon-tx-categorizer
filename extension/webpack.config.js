const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = (env, argv) => {
  const isDev = argv.mode === "development";

  return {
    entry: {
      popup: "./popup/index.tsx",
      options: "./options/index.tsx",
      "content/amazon-scraper": "./content/amazon-scraper.ts",
      "background/service-worker": "./background/service-worker.ts",
    },
    output: {
      path: path.resolve(__dirname, "build"),
      filename: "[name].js",
      clean: true,
    },
    resolve: {
      extensions: [".ts", ".tsx", ".js", ".jsx"],
      alias: {
        "@lib": path.resolve(__dirname, "lib"),
      },
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: "ts-loader",
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: [MiniCssExtractPlugin.loader, "css-loader"],
        },
      ],
    },
    plugins: [
      new MiniCssExtractPlugin({
        filename: "[name].css",
      }),
      new HtmlWebpackPlugin({
        template: "./popup/index.html",
        filename: "popup/index.html",
        chunks: ["popup"],
      }),
      new HtmlWebpackPlugin({
        template: "./options/index.html",
        filename: "options/index.html",
        chunks: ["options"],
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: "manifest.json", to: "manifest.json" },
          { from: "icons", to: "icons", noErrorOnMissing: true },
        ],
      }),
    ],
    devtool: isDev ? "inline-source-map" : false,
    optimization: {
      minimize: !isDev,
    },
  };
};
