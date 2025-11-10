import React, { useState, useEffect, useRef } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import MapView from "./MapView";
import CountrySearchSelect from "./CountrySearchSelect";

interface Coords {
  lat: number;
  lng: number;
}

interface ValidateResponse {
  success: boolean;
  message: string;
  source?: "MongoDB" | "Google";
  coords?: Coords;
  path?: number[][][];
  interpolated?: Coords;
}

const AddressValidator: React.FC = () => {
  const [country, setCountry] = useState<string>("საქართველო");
  const [city, setCity] = useState<string>("");
  const [street, setStreet] = useState<string>("");
  const [houseNumber, setHouseNumber] = useState<string>("");
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [streetSuggestions, setStreetSuggestions] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [source, setSource] = useState<"MongoDB" | "Google">("MongoDB");
  const [coords, setCoords] = useState<Coords | null>(null);
  const [path, setPath] = useState<number[][][] | null>(null);
  const [interpolated, setInterpolated] = useState<Coords | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  const debounce = <T extends (...args: any[]) => any>(func: T, delay: number) => {
    let timeout: number;
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), delay);
    };
  };

  const isGeorgiaCountry = (c: string): boolean =>
    c === "საქართველო" || c.toLowerCase() === "georgia";

  const isGeorgianScript = (text: string): boolean =>
    /^[\u10A0-\u10FF\s.,'-]+$/i.test(text);

  const isLatinScript = (text: string): boolean =>
    /^[a-zA-Z\s.,'-]+$/i.test(text);

  const validateScript = (field: string, value: string): string | null => {
    if (!value) return null;
    const georgia = isGeorgiaCountry(country);
    if (georgia && !isGeorgianScript(value)) {
      return "გთხოვთ, გამოიყენოთ ქართული შრიფტი (მაგ: თბილისი)";
    }
    if (!georgia && !isLatinScript(value)) {
      return "გთხოვთ, გამოიყენოფ ლათინური ასოები (a-z)";
    }
    return null;
  };

  const searchCities = debounce(async (query: string) => {
    if (query.length < 2 || !isGeorgiaCountry(country)) {
      setCitySuggestions([]);
      return;
    }
    try {
      const res = await fetch(
        `http://localhost:5000/api/cities?q=${encodeURIComponent(query)}&country=საქართველო`
      );
      const data: string[] = await res.json();
      setCitySuggestions(data);
    } catch {
      setCitySuggestions([]);
    }
  }, 300);

  const searchStreets = debounce(async (query: string) => {
    if (!city || query.length < 2 || !isGeorgiaCountry(country)) {
      setStreetSuggestions([]);
      return;
    }
    try {
      const res = await fetch(
        `http://localhost:5000/api/streets?city=${encodeURIComponent(city)}&q=${encodeURIComponent(query)}&country=საქართველო`
      );
      const data: string[] = await res.json();
      setStreetSuggestions(data);
    } catch {
      setStreetSuggestions([]);
    }
  }, 300);

  useEffect(() => {
    searchCities(city);
  }, [city, country]);

  useEffect(() => {
    searchStreets(street);
  }, [street, city, country]);

  const handleValidate = async () => {
    const cityError = validateScript("city", city);
    const streetError = validateScript("street", street);
    if (cityError || streetError) {
      setMessage(cityError || streetError);
      return;
    }
    if (!city || !street) {
      setMessage("გთხოვთ, შეავსოთ ქალაქი და ქუჩა");
      return;
    }

    setLoading(true);
    setMessage("მიმდინარეობს...");
    setCoords(null);
    setPath(null);
    setInterpolated(null);

    try {
      const body: any = { country, city, street };
      if (houseNumber) body.houseNumber = houseNumber;

      const res = await fetch("http://localhost:5000/api/validate-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: ValidateResponse = await res.json();

      setMessage(data.message + (data.source ? ` [${data.source}]` : ""));
      if (data.success) {
        setCoords(data.coords || null);
        setSource(data.source || "Google");
        setPath(data.source === "MongoDB" ? data.path || null : null);
        setInterpolated(data.interpolated || null);
      }
    } catch {
      setMessage("შეცდომა: სერვერთან კავშირი");
    } finally {
      setLoading(false);
    }
  };

  const exportToPDF = async () => {
    if (!mapRef.current) return;
    try {
      const canvas = await html2canvas(mapRef.current, { scale: 2 });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.setFontSize(14);
      pdf.text(`მისამართი: ${city}, ${street}${houseNumber ? ` ${houseNumber}` : ""}, ${country}`, 10, pdfHeight + 10);
      pdf.text(`წყარო: ${source}`, 10, pdfHeight + 18);
      if (interpolated || coords) {
        const c = interpolated || coords!;
        pdf.text(`კოორდინატები: ${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}`, 10, pdfHeight + 26);
      }
      pdf.save(`${city}_${street}${houseNumber || ""}_map.pdf`);
    } catch (err) {
      console.error("PDF Error:", err);
    }
  };

  const finalCoords = interpolated || coords;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4 md:p-6 lg:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 md:p-8 text-white">
            <h2 className="text-2xl md:text-3xl font-bold text-center">მისამართის ვალიდატორი</h2>
            <p className="text-sm md:text-base text-center mt-2 opacity-90">საქართველო + მსოფლიო</p>
          </div>


          <div className="p-6 md:p-8 space-y-6">
            <CountrySearchSelect
              value={country}
              onChange={(val: string) => {
                setCountry(val);
                setCity("");
                setStreet("");
                setHouseNumber("");
                setMessage(null);
                setCitySuggestions([]);
                setStreetSuggestions([]);
                setCoords(null);
                setPath(null);
                setInterpolated(null);
              }}
            />
            <div className="relative">
              <input
                type="text"
                placeholder={isGeorgiaCountry(country) ? "ქალაქი (მინ. 2 სიმბოლო)" : "City"}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full p-4 pl-12 border border-gray-300 rounded-2xl text-lg focus:ring-4 focus:ring-blue-200 focus:border-blue-500 transition-all duration-200"
              />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2m-2 0h-5m-9 0h5m-7 0h2" />
                </svg>
              </span>
              {citySuggestions.length > 0 && (
                <ul className="absolute z-30 w-full mt-2 bg-white border border-gray-200 rounded-2xl shadow-2xl max-h-60 overflow-y-auto">
                  {citySuggestions.map((s, i) => (
                    <li
                      key={i}
                      onClick={() => {
                        setCity(s);
                        setCitySuggestions([]);
                      }}
                      className="p-4 hover:bg-blue-50 cursor-pointer text-gray-800 font-medium transition-colors"
                    >
                      {s}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder={isGeorgiaCountry(country) ? "ქუჩა" : "Street"}
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                disabled={!city}
                className="w-full p-4 pl-12 border border-gray-300 rounded-2xl text-lg focus:ring-4 focus:ring-blue-200 focus:border-blue-500 transition-all duration-200 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0h6" />
                </svg>
              </span>
              {streetSuggestions.length > 0 && (
                <ul className="absolute z-30 w-full mt-2 bg-white border border-gray-200 rounded-2xl shadow-2xl max-h-60 overflow-y-auto">
                  {streetSuggestions.map((s, i) => (
                    <li
                      key={i}
                      onClick={() => {
                        setStreet(s);
                        setStreetSuggestions([]);
                      }}
                      className="p-4 hover:bg-blue-50 cursor-pointer text-gray-800 font-medium transition-colors"
                    >
                      {s}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="სახლის ნომერი (არასავალდებულო)"
                value={houseNumber}
                onChange={(e) => setHouseNumber(e.target.value.replace(/[^0-9a-zA-Z\/-]/g, ""))}
                className="w-full p-4 pl-12 border border-gray-300 rounded-2xl text-lg focus:ring-4 focus:ring-blue-200 focus:border-blue-500 transition-all duration-200 placeholder:italic"
              />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeWidth={2} d="M3 7h2l1 7h8l1-7h2" />
                  <path strokeLinecap="round" strokeWidth={2} d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" />
                </svg>
              </span>
            </div>

   
            <button
              onClick={handleValidate}
              disabled={loading || !city || !street}
              className={`w-full py-4 rounded-2xl font-bold text-white text-lg transition-all transform duration-200 flex items-center justify-center gap-3 ${
                loading || !city || !street
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-98 shadow-xl"
              }`}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.3" />
                    <path fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  მიმდინარეობს...
                </>
              ) : (
                <>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  გადაამოწმე
                </>
              )}
            </button>


            {message && (
              <div
                className={`p-5 rounded-2xl text-center font-medium transition-all ${
                  message.includes("ვალიდურია")
                    ? "bg-gradient-to-r from-green-100 to-emerald-100 text-green-800 border-2 border-green-300"
                    : "bg-gradient-to-r from-red-100 to-pink-100 text-red-800 border-2 border-red-300"
                }`}
              >
                {message}
              </div>
            )}

            {message?.includes("ვალიდურია") && finalCoords && (
              <div className="space-y-5">
                <div ref={mapRef} className="h-96 rounded-2xl overflow-hidden shadow-2xl border-4 border-indigo-200">
                  <MapView
                    country={country}
                    city={city}
                    street={street}
                    houseNumber={houseNumber}
                    source={source}
                    coords={coords!}
                    path={path}
                    interpolated={interpolated}
                  />
                </div>

                <button
                  onClick={exportToPDF}
                  className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-4 rounded-2xl font-bold hover:from-green-700 hover:to-emerald-700 active:scale-98 transition-all shadow-xl flex items-center justify-center gap-3"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m-9 9h12a1 1 0 001-1V7a1 1 0 00-1-1H5a1 1 0 00-1 1v12a1 1 0 001 1z" />
                  </svg>
                  PDF გადმოწერა
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddressValidator;