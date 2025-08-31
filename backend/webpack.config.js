const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: './src/main.ts',
  target: 'node',
  mode: 'production',
  externals: {
    // Exclude node_modules and optional dependencies
    '@nestjs/microservices': 'commonjs2 @nestjs/microservices',
    '@nestjs/websockets': 'commonjs2 @nestjs/websockets',
    'cache-manager': 'commonjs2 cache-manager',
    'class-transformer': 'commonjs2 class-transformer',
    'class-validator': 'commonjs2 class-validator',
    'bcrypt': 'commonjs2 bcrypt',
    'aws-sdk': 'commonjs2 aws-sdk',
    'mock-aws-s3': 'commonjs2 mock-aws-s3',
    'nock': 'commonjs2 nock',
    'class-transformer/storage': 'commonjs2 class-transformer/storage',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true, // Skip type checking
            onlyCompileBundledFiles: true,
          },
        },
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@modules': path.resolve(__dirname, 'src/modules'),
      '@common': path.resolve(__dirname, 'src/common'),
      '@config': path.resolve(__dirname, 'src/config'),
      '@database': path.resolve(__dirname, 'src/database'),
    },
  },
  output: {
    path: path.join(__dirname, 'dist'),
    filename: 'main.js',
  },
  plugins: [
    new webpack.IgnorePlugin({
      checkResource(resource) {
        const lazyImports = [
          '@nestjs/microservices',
          '@nestjs/websockets/socket-module',
          '@nestjs/websockets',
          'cache-manager',
          'class-validator',
          'class-transformer',
          'class-transformer/storage',
          'aws-sdk',
          'mock-aws-s3', 
          'nock',
          '@nestjs/microservices/microservices-module',
        ];
        return lazyImports.includes(resource);
      },
    }),
  ],
};