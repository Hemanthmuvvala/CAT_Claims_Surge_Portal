export function getAdjusterStatus(resourceStatus, load, capacity) {
  if (resourceStatus === "unavailable") return "unavailable";
  if (load >= capacity) return "overloaded";
  if (capacity > 0 && load / capacity >= 0.75) return "near_capacity";
  return "available";
}
