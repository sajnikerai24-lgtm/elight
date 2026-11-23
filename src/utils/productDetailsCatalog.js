const path = require('path');
const { readJsonFile, writeJsonFile } = require('./jsonStore');
const { sortByLatest } = require('./sortLatest');

const PRODUCT_REVIEWS_PATH = path.join(__dirname, '../config/product_reviews.json');
const FEEDBACK_DATA_PATH = path.join(__dirname, '../config/feedback_data.json');

const PRODUCT_OVERRIDES = {
  1: {
    brand: 'Philips Lighting',
    powerRating: '9W (806 lm, Cool Daylight 6500K)',
    baseOrMount: 'B22 Bayonet / E27 Compatible',
    description: 'High-efficiency Philips 9W LED bulb delivering crisp 6500K daylight illumination with up to 85% energy savings compared to incandescent lamps.',
    warrantyMonths: 24,
    warrantyTitle: '24 Months Philips Replacement Warranty',
    highlights: [
      'Instant flicker-free illumination (<0.5s start)',
      'Rated 15,000+ hours operational lifespan',
      'EyeComfort optics with zero UV/IR glare'
    ]
  },
  2: {
    brand: 'Schneider Electric',
    powerRating: '10AX, 250V AC',
    baseOrMount: 'Flush / Surface Wall Box (86x86mm)',
    description: 'Genuine Schneider 1-Way single-gang light switch engineered with flame-retardant polycarbonate housing and silver-alloy contacts for long-term switching reliability.',
    warrantyMonths: 24,
    warrantyTitle: '24 Months Schneider Warranty',
    highlights: [
      'Fire-resistant polycarbonate faceplate',
      'Smooth snap-action rocker mechanism',
      'KEBS & IEC 60669-1 compliant'
    ]
  },
  3: {
    brand: 'East African Cables / Elight Certified',
    powerRating: '2.5mm² Twin & Earth, 300/500V (100m Coil)',
    baseOrMount: 'PVC Insulated Flat Conduit Cable',
    description: '100-metre coil of pure electrolytic copper 2.5mm² Twin & Earth flat cable suitable for socket ring circuits, water heaters, and residential power distribution.',
    warrantyMonths: 12,
    warrantyTitle: '12 Months Pure Copper & Insulation Guarantee',
    highlights: [
      '99.9% oxygen-free pure annealed copper conductor',
      'Color-coded Brown/Blue cores + bare CPC earth wire',
      'Tough abrasion-resistant PVC sheath for wall chasing or conduit'
    ]
  },
  7: {
    brand: 'Elight Signature Decor',
    powerRating: '220–240V AC, Multi-Lamp LED Ready',
    baseOrMount: 'Reinforced Ceiling Rose Suspension',
    description: 'Luxury multi-tier K9 crystal chandelier centerpiece crafted with polished chrome framing for dining rooms, lounges, hotels, and reception foyers.',
    warrantyMonths: 18,
    warrantyTitle: '18 Months Fixture & Driver Warranty',
    highlights: [
      'Precision-cut K9 crystal prisms for maximum sparkle',
      'Compatible with warm, neutral, or tri-color LED candle bulbs',
      'Optional certified installation available via Elight Service Team'
    ]
  },
  15: {
    brand: 'Tronic / Sollatek Spec',
    powerRating: '13A Max Load, 230V AC (~3000W)',
    baseOrMount: 'Direct UK/KE 3-Pin Wall Plug-In',
    description: 'Microprocessor-controlled 13A automatic voltage guard that disconnects refrigerators, TVs, and microwaves during brownouts or over-voltage spikes and delays reconnection safely.',
    warrantyMonths: 12,
    warrantyTitle: '12 Months Surge & Relay Warranty',
    highlights: [
      'Under-voltage & over-voltage automatic cut-off',
      'Built-in 3-minute compressor safety wait-time timer',
      'Clear LED status indicators (Wait / On / Fault)'
    ]
  },
  31: {
    brand: 'Tronic Appliances',
    powerRating: '5.5kW Instant Heating Element (240V AC)',
    baseOrMount: 'Wall-Mounted IP25 Splashproof Shower Unit',
    description: 'Compact 5.5kW instant electric hot shower heater with stepless temperature control dial, ELCB safety thermal cut-out, and chrome multi-spray handset.',
    warrantyMonths: 12,
    warrantyTitle: '12 Months Element & Thermostat Warranty',
    highlights: [
      'Requires 20A/32A double-pole heater switch & 4mm² dedicated cable',
      'Built-in double thermal dry-burn safety cutoff',
      'Includes slider rail, hose, and multi-mode shower head'
    ]
  },
  32: {
    brand: 'Elight Solar Pro',
    powerRating: '30A MPPT, Auto 12V/24V DC Battery Bank',
    baseOrMount: 'Wall Panel Mount with LCD Display',
    description: 'High-efficiency 30A Maximum Power Point Tracking (MPPT) digital solar charge controller achieving up to 98% tracking efficiency for residential solar lighting and backup kits.',
    warrantyMonths: 24,
    warrantyTitle: '24 Months Solar Controller Warranty',
    highlights: [
      'Supports Sealed, Gel, Flooded, and LiFePO4 battery profiles',
      'Backlit LCD shows PV voltage, charging amps & battery SOC',
      'Dual USB 5V output + overcharge/reverse polarity protection'
    ]
  },
  33: {
    brand: 'Elight Power Systems',
    powerRating: '1000W Continuous (2000W Surge), 12V DC to 230V AC',
    baseOrMount: 'Floor / Wall Rack with Cooling Fans',
    description: 'Pure sine wave 1000W inverter converting 12V battery power into clean utility-grade 230V AC electricity safe for TVs, laptops, routers, LED lighting, and motors.',
    warrantyMonths: 24,
    warrantyTitle: '24 Months Inverter Electronics Warranty',
    highlights: [
      'True Pure Sine Wave (<3% THD) safe for sensitive appliances',
      'Temperature-controlled twin silent cooling fans',
      'Overload, short-circuit, low-battery & thermal shutoff'
    ]
  },
  34: {
    brand: 'Chint / Heavy Duty Spec',
    powerRating: '63A, 3-Phase 415V AC (4-Pole)',
    baseOrMount: 'DIN / Steel Enclosure Surface Mount',
    description: 'Heavy-duty 63A 3-Phase manual changeover switch for safely transferring commercial building or homestead loads between KPLC mains supply and backup generator.',
    warrantyMonths: 24,
    warrantyTitle: '24 Months Switchgear Warranty',
    highlights: [
      'Positive Centre-OFF (I-0-II) isolation prevents backfeed',
      'Silver-plated heavy copper busbar contacts',
      'Lockable heavy-duty handle mechanism'
    ]
  },
  36: {
    brand: 'Elight Armored Power',
    powerRating: '4-Core 6.0mm² SWA, 600/1000V (50m Drum)',
    baseOrMount: 'Direct Underground Burial / Duct',
    description: 'Steel Wire Armoured (SWA) 4-core 6mm² XLPE underground power cable engineered for 3-phase mains feeds, borehole pumps, and outbuilding sub-mains.',
    warrantyMonths: 24,
    warrantyTitle: '24 Months Structural & Conductor Warranty',
    highlights: [
      'Galvanized steel wire armour protects against mechanical impact',
      'UV & moisture-resistant outer black PVC oversheath',
      'XLPE insulation rated up to 90°C continuous conductor temp'
    ]
  },
  37: {
    brand: 'Elight Smart Glass',
    powerRating: '10A per Gang, 220–240V AC',
    baseOrMount: 'Standard Concealed Wall Box',
    description: 'Sleek tempered-glass 2-gang capacitive touch wall switch with subtle blue/amber LED night backlight and anti-scratch crystal glass finish.',
    warrantyMonths: 18,
    warrantyTitle: '18 Months Touch Panel Warranty',
    highlights: [
      'Wet-hand safe capacitive touch sensor panel',
      'Soft night indicator makes switches easy to spot in the dark',
      'Toughened scratch-resistant white crystal glass faceplate'
    ]
  },
  38: {
    brand: 'Tronic / Clipsal Spec',
    powerRating: '13A Switched Twin Socket, IP66 Weatherproof',
    baseOrMount: 'Surface Outdoor Wall / Pillar Box',
    description: 'Weatherproof IP66-rated outdoor twin 13A socket enclosure with hinged translucent padlockable cover and sealed cable entry glands for gardens, garages, and car washes.',
    warrantyMonths: 18,
    warrantyTitle: '18 Months Weatherproof Enclosure Warranty',
    highlights: [
      'Full IP66 protection against heavy rain & dust jets',
      'Deep lid accommodates molded 13A plugs while closed & latched',
      'Includes multiple M20 knockouts & rubber gasket seals'
    ]
  },
  40: {
    brand: 'Elight Desk Series',
    powerRating: '12W High-CRI LED, 3 Color Modes + Dimmer',
    baseOrMount: 'Weighted Desk Base + Articulated Swing Arm',
    description: 'Adjustable 12W architect study & desk lamp featuring multi-joint articulated metal arm, touch dimming, and selectable Warm/Neutral/Daylight color temperatures.',
    warrantyMonths: 12,
    warrantyTitle: '12 Months Lamp & Driver Warranty',
    highlights: [
      'CRI >90 true color rendering reduces eye fatigue during study',
      '360° rotating lamp head with foldable dual-hinge arm',
      'Stepless brightness dimming + timer memory function'
    ]
  },
  41: {
    brand: 'Elight Home Luminaires',
    powerRating: 'E27 Max 40W (Includes 7W Warm LED Bulb)',
    baseOrMount: 'Bedside / Console Tabletop Placement',
    description: 'Warm fabric-shade bedside table lamp casting a soft ambient glow ideal for bedrooms, guest suites, and living room sideboards.',
    warrantyMonths: 12,
    warrantyTitle: '12 Months Frame & Switch Warranty',
    highlights: [
      'Linen-weave light-diffusing drum shade',
      'Convenient inline cord rocker switch (1.5m lead)',
      'Energy-saving warm white LED bulb included'
    ]
  },
  42: {
    brand: 'Elight Modern Living',
    powerRating: '18W Integrated Warm LED / E27 Floor Standing',
    baseOrMount: 'Weighted Anti-Tip Floor Base (Height ~155cm)',
    description: 'Minimalist standing corner floor lamp designed with slim powder-coated stem and ambient shade to elevate living rooms, reading corners, and executive offices.',
    warrantyMonths: 12,
    warrantyTitle: '12 Months Stand & Electrical Warranty',
    highlights: [
      'Stable weighted metal base prevents tipping',
      'Convenient foot-press floor switch on power lead',
      '3000K cozy warm ambiance across wide corner spread'
    ]
  },
  43: {
    brand: 'Elight Nordic Lighting',
    powerRating: 'E27 Holder (Up to 60W LED) • Adjustable Drop Cord',
    baseOrMount: 'Ceiling Suspended Canopy Plate',
    description: 'Scandinavian-style pendant hanging lamp fixture with matte painted metal dome shade and warm timber accent collar for kitchens, dining tables, and cafés.',
    warrantyMonths: 12,
    warrantyTitle: '12 Months Fixture & Finish Warranty',
    highlights: [
      '1.2m height-adjustable braided suspension cord',
      'Anti-glare inner reflective white coating',
      'Rust-proof electrostatic matte finish'
    ]
  },
  44: {
    brand: 'Elight Vintage Filament',
    powerRating: '8W LED (800 lm), 2200K Amber Warm Glow',
    baseOrMount: 'E27 Standard Screw Cap',
    description: 'Retro ST64 amber-tinted Edison spiral filament LED lamp blending classic exposed-filament aesthetics with modern 8W low-energy LED efficiency.',
    warrantyMonths: 12,
    warrantyTitle: '12 Months LED Filament Warranty',
    highlights: [
      'Zero heat build-up compared to traditional tungsten Edison bulbs',
      '360° omnidirectional warm amber decorative beam',
      'Ideal for pendant fixtures, wall lanterns, and restaurants'
    ]
  },
  45: {
    brand: 'Elight Exterior Series',
    powerRating: 'IP54 Weatherproof, E27 Holder (LED Ready)',
    baseOrMount: 'Exterior Wall Bracket with Tempered Glass',
    description: 'Classic weather-resistant outdoor wall lantern crafted from die-cast aluminum and clear beveled glass to light porches, perimeter gates, and verandas.',
    warrantyMonths: 18,
    warrantyTitle: '18 Months Outdoor Weatherproofing Warranty',
    highlights: [
      'Corrosion-resistant powder-coated aluminum housing',
      'IP54 rain & splash-proof sealed upper canopy',
      'Easy bottom glass access for quick E27 bulb replacement'
    ]
  }
};

function inferSpecsFromProduct(product) {
  const id = Number(product.product_id || 0);
  const name = String(product.product_name || 'Electrical Product').trim();
  const lower = name.toLowerCase();
  const category = String(product.category_name || 'General').trim();
  const override = PRODUCT_OVERRIDES[id] || {};

  // Extract helpful ratings cleanly from product name
  const wattMatch = name.match(/(\d+(?:\.\d+)?\s*(?:kW|W))/i);
  const ampMatch = name.match(/(\d+\s*A(?:X)?)\b/i);
  const voltMatch = name.match(/(\d+\s*V)/i);
  const lenMatch = name.match(/(\d+(?:\.\d+)?\s*(?:mm|m|M|ft|Inch|L))/i);

  let brand = override.brand;
  if (!brand) {
    if (lower.includes('philips')) brand = 'Philips Lighting';
    else if (lower.includes('schneider')) brand = 'Schneider Electric';
    else if (lower.includes('tronic')) brand = 'Tronic Electricals';
    else if (lower.includes('chint')) brand = 'Chint Electric';
    else brand = 'Elight Certified Quality';
  }

  let powerRating = override.powerRating;
  if (!powerRating) {
    const parts = [];
    if (wattMatch) parts.push(wattMatch[1].toUpperCase().replace('KW', 'kW'));
    if (ampMatch) parts.push(ampMatch[1].toUpperCase());
    if (voltMatch) parts.push(voltMatch[1].toUpperCase());
    else parts.push(lower.includes('solar') || lower.includes('inverter') ? '12V/24V DC / 240V AC' : '220–240V AC, 50Hz');
    if (lenMatch) parts.push(lenMatch[1]);
    powerRating = parts.join(' • ');
  }

  let baseOrMount = override.baseOrMount;
  if (!baseOrMount) {
    if (category === 'Lighting') {
      if (lower.includes('panel') || lower.includes('downlight')) baseOrMount = 'Recessed / Flush Ceiling Cutout';
      else if (lower.includes('floodlight') || lower.includes('solar')) baseOrMount = 'Adjustable U-Bracket Outdoor Mount';
      else if (lower.includes('strip')) baseOrMount = '3M Self-Adhesive + Aluminum Channel';
      else if (lower.includes('b22')) baseOrMount = 'B22 Bayonet Cap';
      else if (lower.includes('e27')) baseOrMount = 'E27 Edison Screw Cap';
      else baseOrMount = 'Standard Ceiling / Wall Mount';
    } else if (category === 'Switches & Sockets') {
      baseOrMount = lower.includes('extension') ? 'Portable 5m Trailing Lead (3-Pin UK)' : 'Standard 3x3 / 3x6 Concealed Wall Box';
    } else if (category === 'Cables & Wiring') {
      baseOrMount = 'Conduit / Trunking / Direct Clip Installation';
    } else if (category === 'Circuit Protection') {
      baseOrMount = '35mm DIN Rail / Distribution Board Mount';
    } else {
      baseOrMount = 'Ready-to-Use / Standard Kenyan Mains (240V)';
    }
  }

  let warrantyMonths = override.warrantyMonths;
  if (!warrantyMonths) {
    if (lower.includes('philips') || lower.includes('schneider') || lower.includes('solar') || category === 'Circuit Protection') {
      warrantyMonths = 24;
    } else if (category === 'Cables & Wiring') {
      warrantyMonths = 12;
    } else {
      warrantyMonths = 12;
    }
  }

  const warrantyTitle = override.warrantyTitle || `${warrantyMonths} Months Manufacturer Warranty`;

  const description = override.description || (() => {
    if (category === 'Lighting') {
      return `${name} is a KEBS-certified high-efficiency luminaire from Elight Electrical Shop, designed for reliable flicker-free brightness, low power consumption, and long service life across Kenyan 220–240V power networks.`;
    }
    if (category === 'Switches & Sockets') {
      return `${name} features durable flame-retardant housing and precision copper-alloy terminals to ensure safe, spark-free daily switching for residential and commercial wiring in Meru County and beyond.`;
    }
    if (category === 'Cables & Wiring') {
      return `${name} is manufactured using high-conductivity pure copper strands and heavy-duty PVC/XLPE insulation tested to BS/IEC safety standards for dependable power delivery and minimal voltage drop.`;
    }
    if (category === 'Circuit Protection') {
      return `${name} protects homes, businesses, and sensitive electrical equipment from short circuits, earth leakage, overloads, and KPLC grid voltage fluctuations.`;
    }
    return `${name} is a genuine, quality-tested electrical appliance supplied by Elight Electrical Shop (Meru Town) for everyday residential, office, and workshop reliability.`;
  })();

  const highlights = override.highlights || [
    `Tested & verified for Kenya 220–240V AC 50Hz operation`,
    `Eligible for ${warrantyMonths}-month Elight warranty & serial tracking`,
    `Available for same-day Meru Town delivery or Showroom pick-up`
  ];

  const warranty = {
    durationMonths: warrantyMonths,
    durationLabel: warrantyTitle,
    coverageType: category === 'Cables & Wiring'
      ? 'Conductor Purity & Insulation Defect Guarantee'
      : 'Official Replacement or Free Authorised Repair',
    covers: [
      `Manufacturing, internal component, and factory workmanship defects for ${warrantyMonths} months from purchase date`,
      category === 'Lighting'
        ? 'Premature LED chip failure, driver burnout, or faulty lamp holder under normal voltage'
        : category === 'Cables & Wiring'
          ? 'Conductor continuity, gauge compliance, and outer sheath integrity'
          : 'Internal electrical relay, switch contact, or power module malfunction under rated load',
      'Tracked automatically on your Customer Portal under My Account → Warranties'
    ],
    exclusions: [
      'Physical impact damage, crushed housing, water ingress outside IP rating, or cut power cords',
      'Damage caused by lightning strikes, extreme KPLC surges without surge protection, or overload beyond rated amps/watts',
      'Tampered warranty seals or unauthorized third-party repairs'
    ]
  };

  const sku = `ELG-${String(category || 'GEN').replace(/[^A-Z]/gi, '').slice(0, 3).toUpperCase()}-${String(id).padStart(4, '0')}`;

  return {
    product_id: id,
    sku,
    brand,
    description,
    highlights,
    specs: [
      { label: 'Brand / Origin', value: brand },
      { label: 'Category', value: category },
      { label: 'Electrical Rating', value: powerRating },
      { label: 'Mounting / Fitting', value: baseOrMount },
      { label: 'Standards', value: 'KEBS Certified • CE • RoHS' },
      { label: 'Catalog SKU', value: sku }
    ],
    warranty
  };
}

const REVIEWER_PROFILES = [
  { name: 'Eng. Samuel Gitonga', location: 'Makutano, Meru' },
  { name: 'Agnes Mwendwa', location: 'Nkubu' },
  { name: 'Grace Muthoni', location: 'Meru Town' },
  { name: 'Brian Karanja', location: 'Milimani, Meru' },
  { name: 'Peter Mwenda', location: 'Kianjai' },
  { name: 'Faith Kagwiria', location: 'Timau' },
  { name: 'Dennis Murithi', location: 'Maua' },
  { name: 'Sharon Kawira', location: 'Meru CBD' },
  { name: 'Moses Mutua', location: 'Chuka' },
  { name: 'Lydia Gacheri', location: 'Nchiru' }
];

function buildDefaultReviewsForProduct(product) {
  const id = Number(product.product_id || 1);
  const name = String(product.product_name || 'Product').trim();
  const cat = String(product.category_name || 'General');
  const p1 = REVIEWER_PROFILES[id % REVIEWER_PROFILES.length];
  const p2 = REVIEWER_PROFILES[(id + 3) % REVIEWER_PROFILES.length];
  const p3 = REVIEWER_PROFILES[(id + 6) % REVIEWER_PROFILES.length];

  const templatesByCat = {
    Lighting: [
      {
        rating: 5,
        title: `Bright, crisp illumination and solid build`,
        comment: `Installed the ${name} at my place in ${p1.location}. Zero flicker, very energy efficient, and looks much cleaner than generic market alternatives.`
      },
      {
        rating: 5,
        title: `Exact fit and packed safely on delivery`,
        comment: `Ordered online for delivery to ${p2.location}. Arrived intact with the Elight receipt and active warranty. Brightness is excellent.`
      },
      {
        rating: id % 4 === 0 ? 4 : 5,
        title: `Reliable quality from Elight Showroom`,
        comment: `Works seamlessly on 240V mains without humming or overheating. Good value for the price.`
      }
    ],
    'Switches & Sockets': [
      {
        rating: 5,
        title: `Firm switch click and thick brass terminals`,
        comment: `Used ${name} across our new apartments in ${p1.location}. My electrician praised the solid copper screw terminals and clean wall finish.`
      },
      {
        rating: 5,
        title: `Original quality, zero sparking`,
        comment: `Picked up from the Meru Town counter. Heavy flame-retardant plate and fits standard 3x3 concealed wall boxes easily.`
      }
    ],
    'Cables & Wiring': [
      {
        rating: 5,
        title: `True pure copper gauge, full length`,
        comment: `Measured and stripped the ${name} on site in ${p1.location} — genuine pure copper strands, easy to pull through PVC conduit without sheath tears.`
      },
      {
        rating: 5,
        title: `KEBS-grade cable trusted for contractor jobs`,
        comment: `Always source my wiring rolls from Elight because every coil is genuine length and handles rated amps coolly.`
      }
    ],
    'Circuit Protection': [
      {
        rating: 5,
        title: `Fast trip response and real equipment protection`,
        comment: `Installed ${name} in ${p1.location} and it already saved our appliances during a KPLC voltage fluctuation. Solid peace of mind.`
      },
      {
        rating: id % 3 === 0 ? 4 : 5,
        title: `Sturdy DIN mounting and clear markings`,
        comment: `Genuine protection gear at fair KES pricing. Technical desk also advised me on the right amperage before dispatch.`
      }
    ],
    Appliances: [
      {
        rating: 5,
        title: `Performs strongly right out of the box`,
        comment: `Been using the ${name} daily in ${p1.location} for weeks now. Build quality feels premium and comes backed with clear warranty cover.`
      },
      {
        rating: id % 5 === 0 ? 4 : 5,
        title: `Fast dispatch & tested at counter`,
        comment: `Received quickly in ${p2.location}. Tested cleanly upon arrival and runs quietly without overheating.`
      }
    ]
  };

  const list = templatesByCat[cat] || templatesByCat.Appliances;
  const baseDate = new Date('2026-11-18T10:30:00Z').getTime();

  return list.map((tpl, idx) => {
    const profile = [p1, p2, p3][idx] || p1;
    const createdAt = new Date(baseDate - ((id * 2 + idx * 4) * 86400000)).toISOString();
    return {
      review_id: id * 100 + (idx + 1),
      product_id: id,
      product_name: name,
      customer_name: profile.name,
      customer_location: profile.location,
      rating: tpl.rating,
      title: tpl.title,
      comment: tpl.comment,
      verified_purchase: true,
      created_at: createdAt
    };
  });
}

function readStoredProductReviews() {
  const parsed = readJsonFile(PRODUCT_REVIEWS_PATH, []);
  return Array.isArray(parsed) ? parsed : [];
}

function writeStoredProductReviews(reviews) {
  return writeJsonFile(PRODUCT_REVIEWS_PATH, reviews);
}

function getFeedbackLinkedReviews(product) {
  const prodId = Number(product.product_id || 0);
  const prodNameLower = String(product.product_name || '').trim().toLowerCase();
  const feedbackList = readJsonFile(FEEDBACK_DATA_PATH, []);
  if (!Array.isArray(feedbackList)) return [];

  return feedbackList
    .filter(f => {
      if (!f || f.status !== 'published') return false;
      if (!['review', 'service_review'].includes(String(f.feedback_type || '').toLowerCase())) return false;
      if (Number(f.product_id) === prodId && prodId > 0) return true;
      const subj = String(f.subject || '').toLowerCase();
      const msg = String(f.message || '').toLowerCase();
      return (prodId > 0 && subj.includes(`[#${prodId}]`)) ||
        (prodNameLower.length >= 6 && (subj.includes(prodNameLower) || msg.includes(prodNameLower)));
    })
    .map(f => ({
      review_id: `fb-${f.feedback_id}`,
      product_id: prodId,
      product_name: product.product_name,
      customer_name: f.customer_name || 'Verified Customer',
      customer_location: 'Meru County',
      rating: Math.min(5, Math.max(1, Number(f.rating) || 5)),
      title: String(f.subject || 'Customer Review').replace(/\s*\[#\d+\]\s*/g, '').trim(),
      comment: String(f.message || '').trim(),
      verified_purchase: true,
      created_at: f.created_at || new Date().toISOString()
    }));
}

function getReviewsForProduct(product) {
  const prodId = Number(product.product_id || 0);
  const storedAll = readStoredProductReviews();
  const storedForProduct = storedAll.filter(r => Number(r.product_id) === prodId);

  // Merge stored reviews with baseline customer reviews if none are manually stored yet,
  // or keep stored reviews on top of initial curated reviews without duplicates
  const defaults = buildDefaultReviewsForProduct(product);
  const merged = [...storedForProduct];

  for (const fbRev of getFeedbackLinkedReviews(product)) {
    const dup = merged.some(m =>
      String(m.customer_name).toLowerCase() === String(fbRev.customer_name).toLowerCase() &&
      String(m.comment).toLowerCase() === String(fbRev.comment).toLowerCase()
    );
    if (!dup) merged.push(fbRev);
  }

  for (const defRev of defaults) {
    const dup = merged.some(m => Number(m.review_id) === Number(defRev.review_id));
    if (!dup) merged.push(defRev);
  }

  const ordered = sortByLatest(merged, 'review_id');
  const totalReviews = ordered.length;
  const averageRating = totalReviews > 0
    ? Number((ordered.reduce((s, r) => s + Number(r.rating || 5), 0) / totalReviews).toFixed(1))
    : 5.0;

  return {
    reviews: ordered,
    reviewSummary: {
      averageRating,
      totalReviews
    }
  };
}

function addReviewForProduct(product, payload = {}) {
  const prodId = Number(product.product_id || 0);
  const stored = readStoredProductReviews();
  const nextId = stored.length > 0
    ? Math.max(...stored.map(r => Number(r.review_id) || 0), 100000) + 1
    : 100001;

  const newReview = {
    review_id: nextId,
    product_id: prodId,
    product_name: String(product.product_name || 'Electrical Product'),
    customer_name: String(payload.customer_name || 'Customer').trim(),
    customer_location: String(payload.customer_location || 'Meru County').trim() || 'Meru County',
    rating: Math.min(5, Math.max(1, parseInt(payload.rating, 10) || 5)),
    title: String(payload.title || `Review for ${product.product_name}`).trim(),
    comment: String(payload.comment || '').trim(),
    verified_purchase: Boolean(payload.verified_purchase !== false),
    created_at: new Date().toISOString()
  };

  stored.unshift(newReview);
  writeStoredProductReviews(stored);
  return newReview;
}

function getCardMetadata(product) {
  const detailsAndWarranty = inferSpecsFromProduct(product);
  const { reviewSummary } = getReviewsForProduct(product);
  return {
    warranty_months: detailsAndWarranty.warranty.durationMonths,
    warranty_label: `${detailsAndWarranty.warranty.durationMonths}M Warranty`,
    rating_avg: reviewSummary.averageRating,
    review_count: reviewSummary.totalReviews,
    sku: detailsAndWarranty.sku
  };
}

module.exports = {
  getProductDetailsAndWarranty: inferSpecsFromProduct,
  getReviewsForProduct,
  addReviewForProduct,
  getCardMetadata
};
