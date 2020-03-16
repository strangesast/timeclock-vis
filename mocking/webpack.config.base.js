module.exports = {
  entry: {
    index: './src/index.ts',
  },
  plugins: [],
  module: {
    rules: [{test: /\.ts$/, use: 'ts-loader', exclude: /node_modules/}]
  },
  resolve: {
    extensions: ['.ts']
  },
};
