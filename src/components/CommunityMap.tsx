"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { GoogleMap, useLoadScript, Marker, Circle, InfoWindow } from "@react-google-maps/api";  
import { collection, getDocs, query, where, updateDoc, doc, increment } from "firebase/firestore";
import { db } from "../lib/firebase";
import { AlertTriangle, Video, ShieldAlert, Layers, X, CheckCircle, Wind, Loader2 } from "lucide-react";

// Google Maps requires fixed sizing for the container
const mapContainerStyle = {
  width: "100%",
  height: "100%",
};

// Pure Stealth Dark Mode Style (Matches your #09090B / #18181B theme)
const stealthMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#09090B" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#18181B" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#71717A" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#E5E7EB" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#A1A1AA" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#18181B" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#27272A" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#27272A" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#A1A1AA" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3F3F46" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#3F3F46" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#000000" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#516B8B" }] },
];

// Helper to generate a realistic local CCTV mock based on user location
const generateLocalCCTV = (lat: number, lng: number) => {
  return Array.from({ length: 6 }).map((_, i) => ({
    id: `cctv-${i}`,
    lat: lat + (Math.random() - 0.5) * 0.02,
    lng: lng + (Math.random() - 0.5) * 0.02,
  }));
};

export default function CommunityMap() {
  // Load Google Maps API
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY as string,
    libraries: ["places"], // Required for finding police stations
  });

  const [mapCenter, setMapCenter] = useState({ lat: 30.9045, lng: 77.0967 });
  const [hazards, setHazards] = useState<any[]>([]);
  const [selectedHazard, setSelectedHazard] = useState<any>(null);
  const [hasUpvoted, setHasUpvoted] = useState(false);
  
  const [realSecurityZones, setRealSecurityZones] = useState<any[]>([]);
  const [mockCCTV, setMockCCTV] = useState<any[]>([]);
  const [selectedZone, setSelectedZone] = useState<any>(null);

  const [isLayersMenuOpen, setIsLayersMenuOpen] = useState(false);
  const [layers, setLayers] = useState({ hazards: true, cctv: false, riskZones: true });

  const mapRef = useRef<google.maps.Map | null>(null);

  // 1. Get GPS and Firebase Data
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setMapCenter({ lat, lng });
          setMockCCTV(generateLocalCCTV(lat, lng));
        },
        (error) => console.warn("GPS Access Denied:", error),
        { enableHighAccuracy: true }
      );
    }

    const fetchActiveHazards = async () => {
      try {
        const q = query(collection(db, "complaints"), where("status", "==", "filed"));
        const snapshot = await getDocs(q);
        setHazards(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error("Error fetching Firebase data", error);
      }
    };
    fetchActiveHazards();
  }, []);

  // 2. Fetch Real Police Stations via Google Places API once map loads
  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    const service = new google.maps.places.PlacesService(map);
    
    const request = {
      location: mapCenter,
      radius: 10000, // 10km
      type: 'police',
    };

    service.nearbySearch(request, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        const stations = results.map(place => ({
          id: place.place_id,
          lat: place.geometry?.location?.lat(),
          lng: place.geometry?.location?.lng(),
          name: place.name,
        })).filter(p => p.lat && p.lng);
        setRealSecurityZones(stations);
      }
    });
  }, [mapCenter]);

  const toggleLayer = (layer: keyof typeof layers) => setLayers(prev => ({ ...prev, [layer]: !prev[layer] }));

  const handleISeeThisToo = async (hazardId: string) => {
    try {
      setHasUpvoted(true);
      setSelectedHazard((prev: any) => ({ ...prev, verificationCount: (prev.verificationCount || 1) + 1 }));
      await updateDoc(doc(db, "complaints", hazardId), { verificationCount: increment(1) });
    } catch (err) {
      console.error("Failed to upvote:", err);
      setHasUpvoted(false); 
    }
  };

  // Google Maps custom SVG markers
  const getMarkerIcon = (color: string, scale: number = 8) => ({
    path: isLoaded ? google.maps.SymbolPath.CIRCLE : 0,
    fillColor: color,
    fillOpacity: 1,
    strokeWeight: 3,
    strokeColor: '#FFFFFF',
    scale: scale,
  });

  if (loadError) return <div className="p-5 text-center text-red-500 mt-20">Map cannot be loaded right now. Check API Key.</div>;
  if (!isLoaded) return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#FCFAF5] dark:bg-[#09090B]">
      <Loader2 size={32} className="text-[#516B8B] dark:text-[#E5E7EB] animate-spin" />
      <p className="text-[#6B7280] dark:text-[#A1A1AA] font-bold text-sm mt-3">Loading Google Maps...</p>
    </div>
  );

  return (
    <div className="relative w-full h-[calc(100vh-76px)] overflow-hidden bg-[#FCFAF5] dark:bg-[#09090B]">
      
      {/* FLOATING TOP-LEFT STAT CHIP */}
      <div className="absolute top-4 left-4 z-[400] bg-white/90 dark:bg-[#18181B]/90 backdrop-blur-xl px-4 py-2.5 rounded-full shadow-lg border border-[#E2E8F0] dark:border-[#27272A] flex items-center gap-2">
        <span className="text-[16px]">📍</span>
        <span className="text-[13px] font-bold text-[#1E293B] dark:text-[#E5E7EB]">{hazards.length} active issues</span>
      </div>

      {/* COLLAPSIBLE DATA LAYERS MENU */}
      <div className="absolute top-4 right-4 z-[400] flex flex-col items-end gap-2">
        <button 
          onClick={() => setIsLayersMenuOpen(!isLayersMenuOpen)}
          className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg border border-[#E2E8F0] dark:border-[#27272A] transition-all active:scale-95 ${
            isLayersMenuOpen ? 'bg-[#516B8B] text-white' : 'bg-white/90 dark:bg-[#18181B]/90 text-[#516B8B] dark:text-[#E5E7EB] backdrop-blur-xl'
          }`}
        >
          {isLayersMenuOpen ? <X size={20} /> : <Layers size={20} />}
        </button>

        {isLayersMenuOpen && (
          <div className="bg-white/95 dark:bg-[#18181B]/95 backdrop-blur-xl border border-[#E2E8F0] dark:border-[#27272A] p-4 rounded-[24px] shadow-2xl w-[230px] animate-in fade-in slide-in-from-top-4">
            <h3 className="text-[#1E293B] dark:text-[#E5E7EB] font-bold mb-3 text-[14px]" style={{fontFamily: 'var(--font-jakarta)'}}>Map Layers</h3>
            <div className="space-y-3">
              <button onClick={() => toggleLayer("hazards")} className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className={layers.hazards ? "text-[#EF4444]" : "text-[#9CA3AF] dark:text-[#71717A]"} />
                  <span className={`text-[13px] font-semibold ${layers.hazards ? 'text-[#1E293B] dark:text-[#E5E7EB]' : 'text-[#6B7280] dark:text-[#A1A1AA]'}`}>Reported Hazards</span>
                </div>
                <div className={`w-8 h-4 rounded-full transition-colors ${layers.hazards ? "bg-[#10B981]" : "bg-[#E5E7EB] dark:bg-[#27272A]"}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ${layers.hazards ? "translate-x-4" : "translate-x-0"}`} />
                </div>
              </button>

              <button onClick={() => toggleLayer("cctv")} className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <Video size={16} className={layers.cctv ? "text-[#516B8B]" : "text-[#9CA3AF] dark:text-[#71717A]"} />
                  <span className={`text-[13px] font-semibold ${layers.cctv ? 'text-[#1E293B] dark:text-[#E5E7EB]' : 'text-[#6B7280] dark:text-[#A1A1AA]'}`}>CCTV Coverage</span>
                </div>
                <div className={`w-8 h-4 rounded-full transition-colors ${layers.cctv ? "bg-[#516B8B]" : "bg-[#E5E7EB] dark:bg-[#27272A]"}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ${layers.cctv ? "translate-x-4" : "translate-x-0"}`} />
                </div>
              </button>

              <button onClick={() => toggleLayer("riskZones")} className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <ShieldAlert size={16} className={layers.riskZones ? "text-[#F59E0B]" : "text-[#9CA3AF] dark:text-[#71717A]"} />
                  <span className={`text-[13px] font-semibold ${layers.riskZones ? 'text-[#1E293B] dark:text-[#E5E7EB]' : 'text-[#6B7280] dark:text-[#A1A1AA]'}`}>Police Stations</span>
                </div>
                <div className={`w-8 h-4 rounded-full transition-colors ${layers.riskZones ? "bg-[#F59E0B]" : "bg-[#E5E7EB] dark:bg-[#27272A]"}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ${layers.riskZones ? "translate-x-4" : "translate-x-0"}`} />
                </div>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* GOOGLE MAPS COMPONENT */}
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        zoom={14}
        center={mapCenter}
        onLoad={onMapLoad}
        options={{
          styles: stealthMapStyle,
          disableDefaultUI: true, // Hides all the cluttered Google UI buttons
          gestureHandling: "greedy", // Better mobile scrolling
        }}
        onClick={() => { setSelectedHazard(null); setSelectedZone(null); }}
      >
        {/* User Location Marker */}
        <Marker position={mapCenter} icon={getMarkerIcon("#10B981", 9)} />

        {/* FIREBASE HAZARD DATA */}
        {layers.hazards && hazards.map((hazard) => (
          <Marker 
            key={hazard.id} 
            position={{ lat: hazard.location?.lat || 30.9045, lng: hazard.location?.lng || 77.0967 }} 
            icon={getMarkerIcon("#EF4444")}
            onClick={() => setSelectedHazard(hazard)}
          />
        ))}

        {/* MOCKED CCTV DATA */}
        {layers.cctv && mockCCTV.map((cam) => (
          <Circle 
            key={cam.id}
            center={{ lat: cam.lat, lng: cam.lng }} 
            radius={250} 
            options={{ fillColor: "#516B8B", fillOpacity: 0.15, strokeColor: "#516B8B", strokeWeight: 1 }} 
          />
        ))}

        {/* GOOGLE PLACES API POLICE STATIONS */}
        {layers.riskZones && realSecurityZones.map((zone) => (
          <div key={zone.id}>
            <Marker 
              position={{ lat: zone.lat, lng: zone.lng }} 
              icon={getMarkerIcon("#F59E0B")}
              onClick={() => setSelectedZone(zone)}
            />
            <Circle 
              center={{ lat: zone.lat, lng: zone.lng }} 
              radius={400} 
              options={{ fillColor: "#F59E0B", fillOpacity: 0.1, strokeColor: "#F59E0B", strokeWeight: 2, strokeOpacity: 0.5 }} 
            />
            {selectedZone?.id === zone.id && (
              <InfoWindow position={{ lat: zone.lat, lng: zone.lng }} onCloseClick={() => setSelectedZone(null)}>
                <div className="text-black font-bold p-1">{zone.name}</div>
              </InfoWindow>
            )}
          </div>
        ))}
      </GoogleMap>

      {/* BOTTOM SHEET FOR SELECTED HAZARD */}
      <div 
        className={`absolute bottom-4 left-4 right-4 bg-white/95 dark:bg-[#18181B]/95 backdrop-blur-2xl border border-[#E2E8F0] dark:border-[#27272A] rounded-[24px] shadow-[0_10px_40px_rgba(0,0,0,0.2)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.5)] transition-all duration-300 z-[500] p-5 ${selectedHazard ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-[150%] opacity-0 pointer-events-none'}`}
      >
        {selectedHazard && (
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-start">
              <div className="flex-1 pr-4">
                <span className="bg-[#FEF2F2] dark:bg-[#7F1D1D]/40 text-[#EF4444] dark:text-[#F87171] px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider mb-2 inline-block border border-[#FCA5A5] dark:border-[#991B1B]">
                  Lvl {selectedHazard.analysis?.severity || 3} Hazard
                </span>
                <h3 className="text-[20px] leading-tight font-black text-[#1E293B] dark:text-[#E5E7EB] capitalize" style={{fontFamily: 'var(--font-jakarta)'}}>
                  {selectedHazard.analysis?.subType || selectedHazard.analysis?.category || "Infrastructure Issue"}
                </h3>
                <p className="text-[#6B7280] dark:text-[#A1A1AA] text-[13px] mt-1 leading-relaxed line-clamp-2">
                  {selectedHazard.location?.address}
                </p>
              </div>
              <button 
                onClick={() => setSelectedHazard(null)} 
                className="p-2 bg-[#F3F4F6] dark:bg-[#09090B] rounded-full text-[#6B7280] dark:text-[#A1A1AA] hover:text-[#1E293B] dark:hover:text-[#E5E7EB] active:scale-90 transition-transform shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            <button 
              onClick={() => handleISeeThisToo(selectedHazard.id)}
              disabled={hasUpvoted}
              className={`w-full font-bold text-[16px] h-[52px] rounded-[16px] flex justify-center items-center gap-2 mt-4 transition-all active:scale-[0.98] ${
                hasUpvoted 
                  ? "bg-[#D1FAE5] dark:bg-[#064E3B] text-[#10B981] border border-[#10B981]/30" 
                  : "bg-[#516B8B] dark:bg-[#27272A] text-white shadow-[0_8px_20px_rgba(81,107,139,0.25)] dark:shadow-none"
              }`}
            >
              {hasUpvoted ? <><CheckCircle size={20} /> Verified by You</> : <>✋ I See This Too</>}
            </button>
          </div>
        )}
      </div>

    </div>
  );
}