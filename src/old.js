(() => {
  // --- helpers ---
  const getIdFromUrl = () => {
    const m = location.pathname.match(/\/encyclopedia\/\d+\/resource\/(\d+)\//);
    return m ? Number(m[1]) : null;
  };

  const parseQty = (txt) => {
    // examples: "3x", "1/2x", "0.1x"
    if (!txt) return null;
    const t = txt.trim().replace(/x$/i, "");

    // fraction like "1/2"
    const frac = t.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (frac) {
      const num = Number(frac[1]);
      const den = Number(frac[2]);
      return den ? num / den : null;
    }

    // number like "3" or "0.1"
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  const uniqueBy = (arr, keyFn) => {
    const seen = new Set();
    return arr.filter(x => {
      const k = keyFn(x);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  // --- id ---
  const id = getIdFromUrl();

  // --- name: from the left "product card" column ---
  // structure you gave: <div class="col-xs-4 text-center"> ... <div>Seeds</div> ...
  // take the first child <div> after the image container that is not empty and not a price/label
  let name = null;
  const card = document.querySelector('.col-xs-4.text-center');
  if (card) {
    const divs = [...card.querySelectorAll(':scope > div')];
    // divs often look like: [imgWrap, nameDiv, priceDiv, ...]
    // choose the one that is plain text and not containing <a> or <img>
    const nameDiv =
      divs.find(d => d && d.textContent && !d.querySelector('a, img') && d.textContent.trim().length > 0) ||
      divs[1]; // fallback: common position
    name = nameDiv?.textContent?.trim() ?? null;
  }

  // --- materials: each ingredient span block ---
  const materialSpans = [...document.querySelectorAll('span.css-1jhg4e6.e1d2gsfs3')];

  const materials = materialSpans.map(span => {
    const a = span.querySelector('a[href^="/encyclopedia/0/resource/"]');
    const href = a?.getAttribute('href') || "";
    const m = href.match(/\/resource\/(\d+)\//);
    const mid = m ? Number(m[1]) : null;

    const qtyText = span.querySelector('span.css-1kqm584')?.textContent ?? "";
    const quantity = parseQty(qtyText);

    if (!mid || quantity == null) return null;
    return { id: mid, quantity };
  }).filter(Boolean);

  const result = {
    id,
    name,
    materials: uniqueBy(materials, x => x.id)
  };

  console.log(result);
  return result;
})();
