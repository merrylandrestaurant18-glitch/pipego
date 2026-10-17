import { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from "react-native-maps";
import type { Coordinates, MapPoint } from "./LiveMap";

function regionFor(center: Coordinates): Region {
  return {
    ...center,
    latitudeDelta: 0.12,
    longitudeDelta: 0.12,
  };
}

export default function LiveMap({
  center,
  points,
}: {
  center: Coordinates;
  points: MapPoint[];
}) {
  const map = useRef<MapView>(null);

  useEffect(() => {
    map.current?.animateToRegion(regionFor(center), 450);
  }, [center.latitude, center.longitude]);

  return (
    <View style={styles.container}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        mapType="standard"
        initialRegion={regionFor(center)}
        loadingEnabled
        loadingBackgroundColor="#eaf0eb"
        showsCompass
        toolbarEnabled={false}
      >
        {points.map((point) => (
          <Marker
            key={point.id}
            coordinate={{ latitude: point.latitude, longitude: point.longitude }}
            title={point.label}
            pinColor={point.kind === "customer" ? "#337bd1" : "#276c55"}
          />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFill, overflow: "hidden", backgroundColor: "#eaf0eb" },
});
