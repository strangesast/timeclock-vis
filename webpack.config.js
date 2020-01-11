const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin')
const WorkerPlugin = require('worker-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const package = require('./package.json')

module.exports = {
  mode: 'development',
  entry: {
    index: './src/index.ts',
    simple: './src/simple.ts',
    vendor: Object.keys(package.dependencies),
    worker: './src/data.worker.ts',
  },
  plugins: [
    new HtmlWebpackPlugin({
      title: 'Timeclock',
      chunks: ['vendor', 'index'],
      template: 'src/index.html',
      filename: 'index.html',
    }),
    new HtmlWebpackPlugin({
      title: 'Simple',
      chunks: ['vendor', 'simple'],
      template: 'src/simple.html',
      filename: 'simple.html',
    }),
    new WorkerPlugin(),
    new CopyPlugin([
      {from: 'data/*.json'},
    ]),
  ],
  module: {
    rules: [
      // {
      //   test: /\.worker\./,
      //   use: { loader: 'worker-loader' },
      // },
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
      { test: /\.css$/, loader: "style-loader!css-loader" },
      { test: /\.(png|woff|woff2|eot|ttf|svg)$/, loader: 'url-loader?limit=100000' },
    ]
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  output: {
    filename: '[name].bundle.js',
  }
};
