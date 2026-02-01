function kategorijaAQI(aqi) {
  // Nije savršeno “službeno” za sve zemlje, ali je dovoljno za projekt.
  if (aqi <= 50) return "Dobro";
  if (aqi <= 100) return "Umjereno";
  if (aqi <= 150) return "Nezdravo za osjetljive skupine";
  if (aqi <= 200) return "Nezdravo";
  if (aqi <= 300) return "Vrlo nezdravo";
  return "Opasno";
}

function setStatus(el, type, text) {
  el.classList.remove("muted", "ok", "err");
  el.classList.add(type);
  el.textContent = text;
}

function getVal(id) {
  return document.getElementById(id).value.trim();
}

function getNum(id) {
  const v = document.getElementById(id).value;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("aqiForm");
  const status = document.getElementById("status");
  const aqiValue = document.getElementById("aqiValue");
  const aqiLabel = document.getElementById("aqiLabel");
  const rawJson = document.getElementById("rawJson");
  const btnPredict = document.getElementById("btnPredict");
  const btnFill = document.getElementById("btnFill");

  btnFill.addEventListener("click", () => {
    document.getElementById("Date").value = "2025-01-01 12:00:00+00:00";
    document.getElementById("City").value = "London";
    document.getElementById("CO").value = "250";
    document.getElementById("NO2").value = "40";
    document.getElementById("SO2").value = "12";
    document.getElementById("O3").value = "60";
    document.getElementById("PM25").value = "18";
    document.getElementById("PM10").value = "30";
    setStatus(status, "muted", "Popunjen primjer. Klikni „Izračunaj“.");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const apiBase = getVal("apiBase") || "http://127.0.0.1:8000";
    const url = apiBase.replace(/\/+$/, "") + "/predict";

    const payload = {
      Date: getVal("Date"),
      City: getVal("City"),
      CO: getNum("CO"),
      NO2: getNum("NO2"),
      SO2: getNum("SO2"),
      O3: getNum("O3"),
      PM25: getNum("PM25"),
      PM10: getNum("PM10"),
    };

    // Brza provjera
    if (!payload.Date || !payload.City) {
      setStatus(status, "err", "Unesi datum i odaberi grad.");
      return;
    }
    for (const k of ["CO","NO2","SO2","O3","PM25","PM10"]) {
      if (!Number.isFinite(payload[k]) || payload[k] < 0) {
        setStatus(status, "err", `Polje ${k} mora biti broj ≥ 0.`);
        return;
      }
    }

    btnPredict.disabled = true;
    setStatus(status, "muted", "Šaljem zahtjev…");

    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await r.json().catch(() => ({}));
      rawJson.textContent = JSON.stringify(data, null, 2);

      if (!r.ok) {
        setStatus(status, "err", `Greška (${r.status}). Provjeri detalje odgovora.`);
        aqiValue.textContent = "—";
        aqiLabel.textContent = "—";
        return;
      }

      const aqi = Number(data.aqi);
      if (!Number.isFinite(aqi)) {
        setStatus(status, "err", "Poslužitelj nije vratio ispravnu vrijednost AQI.");
        aqiValue.textContent = "—";
        aqiLabel.textContent = "—";
        return;
      }

      aqiValue.textContent = aqi.toFixed(2);
      aqiLabel.textContent = kategorijaAQI(aqi);
      setStatus(status, "ok", "Uspješno izračunato.");
    } catch (err) {
      setStatus(status, "err", "Ne mogu doći do poslužitelja. Je li FastAPI pokrenut?");
      aqiValue.textContent = "—";
      aqiLabel.textContent = "—";
      rawJson.textContent = JSON.stringify({ error: String(err) }, null, 2);
    } finally {
      btnPredict.disabled = false;
    }
  });
});
