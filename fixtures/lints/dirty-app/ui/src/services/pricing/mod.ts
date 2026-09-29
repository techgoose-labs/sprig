// Fixture (dirty): a service calling a raw URL. Services are in the contract
// lint's scope (every .ts under ui/src), not the logic lint's.
async function loadRates(): Promise<unknown> {
  // sprig-contract: public FX feed, not our API
  const fx = await fetch("https://fx.example.com/latest");
  const own = await fetch(`/api/rates`);
  return [await fx.json(), await own.json()];
}
