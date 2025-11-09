import React, { useState, useEffect, useRef } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import MapView from "./MapView";
import CountrySearchSelect from "./CountrySearchSelect";

const AddressValidator: React.FC = () => {
  const [country, setCountry] = useState("საქართველო");
  const [city, setCity] = useState("");
  const [street, setStreet] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [streetSuggestions, setStreetSuggestions] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<"MongoDB" | "Google">("MongoDB");
  const mapRef = useRef<HTMLDivElement>(null);


  const debounce = (func: (...args: any[]) => void, delay: number) => {
    let timeout: number;
    return (...args: any[]) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), delay);
    };
  };


  const isGeorgia = (c: string) => c === "საქართველო" || c.toLowerCase() === "georgia";


  const isGeorgianScript = (text: string) => /^[\u10A0-\u10FF\s.,'-]+$/i.test(text);


  const isLatinScript = (text: string) => /^[a-zA-Z\s.,'-]+$/i.test(text);


  const validateScript = (field: string, value: string): string | null => {
    if (!value) return null;
    const georgia = isGeorgia(country);
    if (georgia && !isGeorgianScript(value)) {
      return "გთხოვთ, გამოიყენოთ ქართული შრიფტი (მაგ: თბილისი, კოსტავას ქუჩა)";
    }
    if (!georgia && !isLatinScript(value)) {
      return "გთხოვთ, გამოიყენოთ ლათინური ასოები (a-z, მაგ: Berlin, Main Street)";
    }
    return null;
  };


  const searchCities = debounce(async (query: string) => {
    if (query.length < 2 || !isGeorgia(country)) {
      setCitySuggestions([]);
      return;
    }
    try {
      const res = await fetch(`http://localhost:5000/api/cities?q=${encodeURIComponent(query)}&country=საქართველო`);
      const data = await res.json();
      setCitySuggestions(data);
    } catch {
      setCitySuggestions([]);
    }
  }, 300);


  const searchStreets = debounce(async (query: string) => {
    if (!city || query.length < 2 || !isGeorgia(country)) {
      setStreetSuggestions([]);
      return;
    }
    try {
      const res = await fetch(`http://localhost:5000/api/streets?city=${encodeURIComponent(city)}&q=${encodeURIComponent(query)}&country=საქართველო`);
      const data = await res.json();
      setStreetSuggestions(data);
    } catch {
      setStreetSuggestions([]);
    }
  }, 300);

  useEffect(() => { searchCities(city); }, [city, country]);
  useEffect(() => { searchStreets(street); }, [street, city, country]);


  const handleValidate = async () => {
    const cityScriptError = validateScript("city", city);
    const streetScriptError = validateScript("street", street);

    if (cityScriptError || streetScriptError) {
      setMessage(cityScriptError || streetScriptError);
      return;
    }

    if (!city || !street) {
      setMessage("გთხოვთ, შეავსოთ ყველა ველი");
      return;
    }

    setLoading(true);
    setMessage("მიმდინარეობს...");
    try {
      const res = await fetch("http://localhost:5000/api/validate-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country, city, street }),
      });
      const data = await res.json();
      setMessage(data.message + (data.source ? ` [${data.source}]` : ""));
      setSource(data.source || "Google");
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
      pdf.text(`მისამართი: ${city}, ${street}, ${country}`, 10, pdfHeight + 10);
      pdf.text(`წყარო: ${source}`, 10, pdfHeight + 18);
      pdf.save(`${city}_${street}_map.pdf`);
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
          setMessage(null);
          setCitySuggestions([]);
          setStreetSuggestions([]);
        }}
      />


      <div className="w-full relative">
        <input
          type="text"
          placeholder={isGeorgia(country) ? "ქალაქი (მინ. 2 სიმბოლო)" : "City"}
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


      <div className="w-full relative">
        <input
          type="text"
          placeholder={isGeorgia(country) ? "ქუჩა (მინ. 2 სიმბოლო)" : "Street"}
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


      {message && message.includes("ვალიდურია") && (
        <div className="w-full space-y-4">
          <div ref={mapRef} className="rounded-lg overflow-hidden shadow-md">
            <MapView country={country} city={city} street={street} source={source} />
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