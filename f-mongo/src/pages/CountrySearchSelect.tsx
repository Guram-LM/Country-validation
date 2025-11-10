import { useState, useEffect, useRef } from "react";
import { countries } from "../data/countries";

interface CountrySearchSelectType {
  value: string
  onChange: (val: string) => void
}
const CountrySearchSelect:React.FC<CountrySearchSelectType> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const filteredCountries = countries.filter((c) => {
    const ka = c.ka?.toLowerCase() || "";
    const en = c.en.toLowerCase();
    const query = search.toLowerCase();
    return ka.includes(query) || en.includes(query);
  });

  const displayValue = countries.find((c) => (c.ka || c.en) === value)?.ka || value || "ჩაწერეთ ქვეყანა...";

  useEffect(() => {
    const handleClickOutside = (e:MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as any)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [search]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % filteredCountries.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + filteredCountries.length) % filteredCountries.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = filteredCountries[highlightedIndex];
      if (selected) {
        onChange(selected.ka || selected.en);
        setIsOpen(false);
        setSearch("");
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setSearch("");
    }
  };

  const handleSelect = (c: { ka?: string; en: string }) => {
    onChange(c.ka || c.en);
    setIsOpen(false);
    setSearch("");
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <div
        className="w-full p-3 border border-gray-300 rounded-lg text-lg bg-white cursor-pointer flex justify-between items-center focus-within:ring-2 focus-within:ring-blue-500"
        onClick={() => {
          setIsOpen(!isOpen);
          inputRef.current?.focus();
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={isOpen ? search : displayValue}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="ჩაწერეთ ქვეყანა..."
          className="w-full outline-none"
        />
        <svg
          className={`w-5 h-5 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {isOpen && (
        <div className="absolute z-40 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-80 overflow-y-auto">
          {filteredCountries.length === 0 ? (
            <div className="p-4 text-center text-gray-500">ქვეყანა ვერ მოიძებნა</div>
          ) : (
            filteredCountries.map((c, i) => (
              <div
                key={c.en}
                onClick={() => handleSelect(c)}
                className={`p-3 cursor-pointer flex justify-between items-center transition-colors ${
                  i === highlightedIndex ? "bg-blue-100" : "hover:bg-gray-50"
                }`}
              >
                <span className="font-medium">{c.ka || c.en}</span>
                {c.ka && <span className="text-sm text-gray-500">({c.en})</span>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default CountrySearchSelect;