const yn = require('yn');
const WorkerPlugin = require('worker-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin')
const { DefinePlugin } = require('webpack');

const package = require('./package.json')


module.exports = {
  entry: {
    index: './src/index.ts',
    next: './src/next.ts',
    simple: './src/simple.ts',
    concept: './src/concept.ts',
    worker: './src/data.worker.ts',
    sw: './src/sw.js',
    vendor: Object.keys(package.dependencies),
  },
  plugins: [
    new HtmlWebpackPlugin({
      title: 'Index',
      chunks: ['vendor', 'index'],
      template: 'src/index.html',
      filename: 'index.html',
    }),
    new HtmlWebpackPlugin({
      title: 'Next',
      chunks: ['vendor', 'next'],
      template: 'src/next.html',
      filename: 'next.html',
    }),
    new HtmlWebpackPlugin({
      title: 'Simple',
      chunks: ['vendor', 'simple'],
      template: 'src/simple.html',
      filename: 'simple.html',
    }),
    new HtmlWebpackPlugin({
      title: 'Concept',
      chunks: ['vendor', 'concept'],
      template: 'src/concept.html',
      filename: 'concept.html',
    }),
    new WorkerPlugin({
      globalObject: 'self',
    }),
    new DefinePlugin({
      GENERATE_MOCKING: yn(process.env.GENERATE_MOCKING, {default: false}),
    }),
  ],
  module: {
    rules: [
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
};
