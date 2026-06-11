/**
 * Language Mode — declare the language of each frame for screen readers.
 *
 * Simple dropdown to set the HTML lang attribute equivalent for a frame.
 * Helps screen readers pronounce text correctly.
 */

import React, { useState } from "react";
import { useUIBridge } from "../hooks/useUIBridge";

const LANGUAGES = [
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "es-VE", label: "Spanish (Venezuela)" },
  { code: "es-ES", label: "Spanish (Spain)" },
  { code: "es-MX", label: "Spanish (Mexico)" },
  { code: "fr-FR", label: "French" },
  { code: "de-DE", label: "German" },
  { code: "pt-BR", label: "Portuguese (Brazil)" },
  { code: "it-IT", label: "Italian" },
  { code: "ja-JP", label: "Japanese" },
  { code: "zh-CN", label: "Chinese (Simplified)" },
  { code: "zh-TW", label: "Chinese (Traditional)" },
];

export default function LanguageMode() {
  const { postMessage } = useUIBridge();
  const [frameId, setFrameId] = useState<string>("page");
  const [selectedLang, setSelectedLang] = useState("en-US");

  const handleLanguageChange = (newLang: string) => {
    setSelectedLang(newLang);
    postMessage({
      type: "annotate-language",
      frameId,
      lang: newLang,
    });
  };

  return (
    <div className="language-mode">
      <div className="language-header">
        <h3>Declare page language</h3>
        <p>
          Setting the language helps screen readers pronounce text correctly.
        </p>
      </div>

      <div className="language-selector-group">
        <label htmlFor="language-select">Language:</label>
        <select
          id="language-select"
          className="language-select"
          value={selectedLang}
          onChange={(e) => handleLanguageChange(e.target.value)}
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>

      <div className="language-info">
        <p>
          <strong>Selected:</strong> {selectedLang}
        </p>
        <p className="language-info-text">
          This setting will be applied to the current frame. When exported to
          HTML, the <code>lang</code> attribute will be set accordingly.
        </p>
      </div>
    </div>
  );
}
