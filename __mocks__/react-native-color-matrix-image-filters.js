const Identity = ({children}) => children ?? null;

module.exports = {
  __esModule: true,
  default: Identity,
  concatColorMatrices: jest.fn(() => []),
  grayscale: jest.fn(() => []),
  contrast: jest.fn(() => []),
  brightness: jest.fn(() => []),
  saturate: jest.fn(() => []),
  sepia: jest.fn(() => []),
  invert: jest.fn(() => []),
  ColorMatrix: Identity,
};
