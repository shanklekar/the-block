const VEHICLE_QUERY_PARAM = "vehicle";

function buildVehicleUrl(vehicleId = "", location = window.location) {
  const url = new URL(location.href);
  const normalizedVehicleId = String(vehicleId ?? "").trim();

  if (normalizedVehicleId) {
    url.searchParams.set(VEHICLE_QUERY_PARAM, normalizedVehicleId);
  } else {
    url.searchParams.delete(VEHICLE_QUERY_PARAM);
  }

  return url;
}

export function readSharedVehicleId(location = window.location) {
  return new URL(location.href).searchParams.get(VEHICLE_QUERY_PARAM) ?? "";
}

export function buildVehicleHistoryPath(vehicleId = "", location = window.location) {
  const url = buildVehicleUrl(vehicleId, location);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function buildVehicleShareUrl(vehicleId = "", location = window.location) {
  return buildVehicleUrl(vehicleId, location).toString();
}
