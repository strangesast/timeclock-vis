const yn = require('yn');
const { DefinePlugin } = require('webpack');
const WorkerPlugin = require('worker-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin');


module.exports = {
  entry: {
    index: './src/index.ts',
    graph: './src/graph.ts',
    weekly: './src/weekly.ts',
    worker: './src/data.worker.ts',
    sw: './src/sw.js',
  },
  plugins: [
    new HtmlWebpackPlugin({
      title: 'Timeclock',
      chunks: ['index'],
      template: 'src/index.html',
      filename: 'index.html',
    }),
    new HtmlWebpackPlugin({
      title: 'Timeclock Employee Cumulative Graph',
      chunks: ['graph'],
      template: 'src/graph.html',
      filename: 'graph.html',
    }),
    new HtmlWebpackPlugin({
      title: 'Timeclock Weekly Graph',
      chunks: ['weekly'],
      template: 'src/weekly.html',
      filename: 'weekly.html',
    }),
    // new WorkerPlugin({
    //   globalObject: 'self',
    // }),
    new DefinePlugin({
      GENERATE_MOCKING: yn(process.env.GENERATE_MOCKING, {default: false}),
      DEBUG: yn(process.env.DEBUG, {default: true}),
      NODE_ENV: process.env.NODE_ENV || '"development"',
    }),
    new CopyPlugin([
      {from: 'static', to: 'static'},
      'favicon.ico',
    ]),
    new MiniCssExtractPlugin(),
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
      { test: /\.scss$/, use: ['style-loader', MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader'], },
    ]
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  output: {
    filename: '[name].js',
  },
};
