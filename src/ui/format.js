export function moneyParts(value) {
  return {
    symbol: value < 0 ? '-$' : '$',
    text: Math.abs(value).toLocaleString('en-US')
  };
}
