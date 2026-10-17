import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const isEasBuild = Boolean(process.env.EAS_BUILD_PROFILE);
  if (isEasBuild && !googleMapsApiKey) {
    throw new Error("Set GOOGLE_MAPS_API_KEY in the EAS build environment before building Pipego.");
  }
  if (isEasBuild && !apiBaseUrl) {
    throw new Error("Set EXPO_PUBLIC_API_BASE_URL to the public Railway API URL before building Pipego.");
  }
  if (isEasBuild && apiBaseUrl && !apiBaseUrl.startsWith("https://")) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL must use HTTPS for EAS builds.");
  }
  const mapsPlugin: ExpoConfig["plugins"] = googleMapsApiKey
    ? [[
        "react-native-maps",
        {
          androidGoogleMapsApiKey: googleMapsApiKey,
          iosGoogleMapsApiKey: googleMapsApiKey,
        },
      ]]
    : [];

  return {
    ...config,
    name: config.name ?? "Pipego",
    slug: config.slug ?? "pipego",
    plugins: [
      ...(config.plugins ?? []),
      ...mapsPlugin,
    ],
  };
};
