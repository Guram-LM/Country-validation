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
  interpolated?: Coords; // ← ახალი: ზუსტი წერტილი ნომრით
}

const AddressValidator: React.FC = () => {
  const [country, setCountry] = useState<string>("საქართველო");
  const [city, setCity] = useState<string>("");
  const [street, setStreet] = useState<string>("");
  const [houseNumber, setHouseNumber] = useState<string>(""); // ← ახალი
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [streetSuggestions, setStreetSuggestions] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [source, setSource] = useState<"MongoDB" | "Google">("MongoDB");
  const [coords, setCoords] = useState<Coords | null>(null);
  const [path, setPath] = useState<number[][][] | null>(null);
  const [finalCoords, setFinalCoords] = useState<Coords | null>(null); // ← საბოლოო წერტილი
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
      return "გთხოვთ, გამოიყენოთ ქართული შრიფტი (მაგ: თბილისი, კოსტავას ქუჩა)";
    }
    if (!georgia && !isLatinScript(value)) {
      return "გთხოვთ, გამოიყენოთ ლათინური ასოები (a-z, მაგ: Berlin, Main Street)";
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
    const cityScriptError = validateScript("city", city);
    const streetScriptError = validateScript("street", street);
    if (cityScriptError || streetScriptError) {
      setMessage(cityScriptError || streetScriptError);
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
    setFinalCoords(null);

    try {
      const body: any = { country, city, street };
      if (houseNumber) body.houseNumber = houseNumber; // ← გადაეცემა, მაგრამ არა ვალიდაციაში

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
        setFinalCoords(data.interpolated || data.coords || null);
      }
    } catch (err) {
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
      if (finalCoords) {
        pdf.text(
          `კოორდინატები: lat ${finalCoords.lat.toFixed(6)}, lng ${finalCoords.lng.toFixed(6)}`,
          10,
          pdfHeight + 26
        );
      }
      pdf.save(`${city}_${street}${houseNumber || ""}_map.pdf`);
    } catch (err) {
      console.error("PDF Error:", err);
    }
  };

  return (
    <div className="flex flex-col items-center gap-5 p-6 md:p-10 max-w-4xl mx-auto bg-gray-50 rounded-xl shadow-lg">
      <h2 className="text-3xl font-bold text-blue-700">მისამართის ვალიდაცია</h2>

      <CountrySearchSelect
        value={country}
        onChange={(val) => {
          setCountry(val);
          setCity("");
          setStreet("");
          setHouseNumber("");
          setMessage(null);
          setCitySuggestions([]);
          setStreetSuggestions([]);
          setCoords(null);
          setPath(null);
          setFinalCoords(null);
        }}
      />

      {/* City */}
      <div className="w-full relative">
        <input
          type="text"
          placeholder={isGeorgiaCountry(country) ? "ქალაქი (მინ. 2 სიმბოლო)" : "City"}
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded-lg text-lg focus:ring-2 focus:ring-blue-500"
        />
        {citySuggestions.length > 0 && (
          <ul className="absolute z-30 w-full bg-white border border-gray-200 rounded-lg mt-1 shadow-xl max-h-60 overflow-y-auto">
            {citySuggestions.map((s, i) => (
              <li
                key={i}
                className="p-3 hover:bg-blue-50 cursor-pointer text-gray-800 font-medium"
                onClick={() => {
                  setCity(s);
                  setCitySuggestions([]);
                }}
              >
                {s}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Street */}
      <div className="w-full relative">
        <input
          type="text"
          placeholder={isGeorgiaCountry(country) ? "ქუჩა (მინ. 2 სიმბოლო)" : "Street"}
          value={street}
          onChange={(e) => setStreet(e.target.value)}
          disabled={!city}
          className="w-full p-3 border border-gray-300 rounded-lg text-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
        />
        {streetSuggestions.length > 0 && (
          <ul className="absolute z-30 w-full bg-white border border-gray-200 rounded-lg mt-1 shadow-xl max-h-60 overflow-y-auto">
            {streetSuggestions.map((s, i) => (
              <li
                key={i}
                className="p-3 hover:bg-blue-50 cursor-pointer text-gray-800 font-medium"
                onClick={() => {
                  setStreet(s);
                  setStreetSuggestions([]);
                }}
              >
                {s}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* House Number – არა სავალდებულო */}
      <div className="w-full">
        <input
          type="text"
          placeholder="ქუჩის ნომერი (არასავალდებულო)"
          value={houseNumber}
          onChange={(e) => setHouseNumber(e.target.value.replace(/[^0-9a-zA-Z\/-]/g, ""))}
          className="w-full p-3 border border-gray-300 rounded-lg text-lg focus:ring-2 focus:ring-blue-500 placeholder:italic"
        />
      </div>

      <button
        onClick={handleValidate}
        disabled={loading || !city || !street}
        className={`w-full py-3 rounded-lg font-bold text-white transition-all ${
          loading || !city || !street
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-blue-600 hover:bg-blue-700 active:scale-95"
        }`}
      >
        {loading ? "მიმდინარეობს..." : "გადაამოწმე"}
      </button>

      {/* Map + PDF */}
      {message && message.includes("ვალიდურია") && finalCoords && (
        <div className="w-full space-y-4">
          <div ref={mapRef} className="rounded-lg overflow-hidden shadow-md">
            <MapView
              country={country}
              city={city}
              street={street}
              houseNumber={houseNumber}
              source={source}
              coords={finalCoords}
              path={path}
            />
          </div>
          <button
            onClick={exportToPDF}
            className="w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 active:scale-95 transition-all"
          >
            PDF-ად გადმოწერა
          </button>
        </div>
      )}

      {message && (
        <p
          className={`text-lg font-medium text-center px-6 py-3 rounded-lg w-full ${
            message.includes("ვალიდურია")
              ? "text-green-700 bg-green-100 border border-green-300"
              : "text-red-700 bg-red-100 border border-red-300"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
};

export default AddressValidator;