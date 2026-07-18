const KM_TO_MILES = 0.621371;

export const SEARCH_BATCH_SIZE = 24;

export const DEFAULT_FILTERS = {
  text: {
    vin: "",
    model: "",
    trim: "",
    engine: "",
    city: "",
    selling_dealership: "",
  },
  categorical: {
    make: [],
    body_style: [],
    exterior_color: [],
    interior_color: [],
    transmission: [],
    drivetrain: [],
    fuel_type: [],
    title_status: [],
    province: [],
  },
  range: {
    year: { min: "", max: "" },
    odometer_km: { min: "", max: "" },
    condition_grade: { min: "", max: "" },
    starting_bid: { min: "", max: "" },
    reserve_price: { min: "", max: "" },
    buy_now_price: { min: "", max: "" },
    current_bid: { min: "", max: "" },
  },
  datetime: {
    auction_start: { min: "", max: "" },
  },
};

export const FILTER_GROUPS = [
  {
    title: "Advanced IDs",
    fields: [
      { name: "vin", label: "VIN", type: "text", placeholder: "Search VIN" },
    ],
  },
  {
    title: "Vehicle",
    fields: [
      { name: "make", label: "Make", type: "checkboxes" },
      { name: "model", label: "Model", type: "text", placeholder: "Search model" },
      { name: "year", label: "Year", type: "range", inputMode: "numeric", step: 1 },
      { name: "trim", label: "Trim", type: "text", placeholder: "Search trim" },
      { name: "body_style", label: "Body Style", type: "checkboxes" },
      { name: "exterior_color", label: "Exterior Color", type: "checkboxes" },
      { name: "interior_color", label: "Interior Color", type: "checkboxes" },
    ],
  },
  {
    title: "Mechanical",
    fields: [
      { name: "engine", label: "Engine", type: "text", placeholder: "Search engine" },
      { name: "transmission", label: "Transmission", type: "checkboxes" },
      { name: "drivetrain", label: "Drivetrain", type: "checkboxes" },
      { name: "fuel_type", label: "Fuel Type", type: "checkboxes" },
      {
        name: "odometer_km",
        label: "Miles",
        type: "range",
        inputMode: "numeric",
        step: 100,
        displayAsMiles: true,
      },
    ],
  },
  {
    title: "Condition",
    fields: [
      {
        name: "condition_grade",
        label: "Condition Grade",
        type: "range",
        inputMode: "decimal",
        step: 0.1,
      },
      { name: "title_status", label: "Title Status", type: "checkboxes" },
    ],
  },
  {
    title: "Auction & Pricing",
    fields: [
      { name: "auction_start", label: "Auction Start", type: "datetime" },
      {
        name: "starting_bid",
        label: "Starting Bid",
        type: "range",
        inputMode: "numeric",
        step: 100,
        prefix: "$",
      },
      {
        name: "reserve_price",
        label: "Reserve Price",
        type: "range",
        inputMode: "numeric",
        step: 100,
        prefix: "$",
      },
      {
        name: "buy_now_price",
        label: "Buy Now Price",
        type: "range",
        inputMode: "numeric",
        step: 100,
        prefix: "$",
      },
      {
        name: "current_bid",
        label: "Current Bid",
        type: "range",
        inputMode: "numeric",
        step: 100,
        prefix: "$",
      },
    ],
  },
  {
    title: "Location & Seller",
    fields: [
      { name: "province", label: "Province", type: "checkboxes" },
      { name: "city", label: "City", type: "text", placeholder: "Search city" },
      {
        name: "selling_dealership",
        label: "Selling Dealership",
        type: "text",
        placeholder: "Search dealership",
      },
    ],
  },
];

function parseNumber(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isNaN(parsedValue) ? null : parsedValue;
}

function buildTextRule(field, value) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  return {
    field,
    operator: "contains",
    value: trimmedValue,
  };
}

function buildMultiSelectRule(field, values) {
  if (!values.length) {
    return null;
  }

  return {
    field,
    operator: "in",
    value: values,
  };
}

function buildRangeRules(field, value, config = {}) {
  const minimum = parseNumber(value.min);
  const maximum = parseNumber(value.max);

  if (minimum === null && maximum === null) {
    return [];
  }

  const normalizeValue = (entry) => {
    if (entry === null) {
      return null;
    }

    if (config.displayAsMiles) {
      return Math.round(entry / KM_TO_MILES);
    }

    return entry;
  };

  const normalizedMinimum = normalizeValue(minimum);
  const normalizedMaximum = normalizeValue(maximum);

  if (normalizedMinimum !== null && normalizedMaximum !== null) {
    return [
      {
        field,
        operator: "between",
        value: {
          min: normalizedMinimum,
          max: normalizedMaximum,
        },
      },
    ];
  }

  if (normalizedMinimum !== null) {
    return [
      {
        field,
        operator: "gte",
        value: normalizedMinimum,
      },
    ];
  }

  return [
    {
      field,
      operator: "lte",
      value: normalizedMaximum,
    },
  ];
}

function toIsoDateTime(localDateTime) {
  if (!localDateTime) {
    return null;
  }

  return localDateTime.length === 16 ? `${localDateTime}:00` : localDateTime;
}

export function buildSearchCriteria(filters) {
  const rules = [];

  for (const [field, value] of Object.entries(filters.text)) {
    const rule = buildTextRule(field, value);

    if (rule) {
      rules.push(rule);
    }
  }

  for (const [field, values] of Object.entries(filters.categorical)) {
    const rule = buildMultiSelectRule(field, values);

    if (rule) {
      rules.push(rule);
    }
  }

  for (const group of FILTER_GROUPS) {
    for (const field of group.fields) {
      if (field.type !== "range") {
        continue;
      }

      const nextRules = buildRangeRules(field.name, filters.range[field.name], field);
      rules.push(...nextRules);
    }
  }

  const auctionStartMinimum = toIsoDateTime(filters.datetime.auction_start.min);
  const auctionStartMaximum = toIsoDateTime(filters.datetime.auction_start.max);

  if (auctionStartMinimum && auctionStartMaximum) {
    rules.push({
      field: "auction_start",
      operator: "between",
      value: {
        min: auctionStartMinimum,
        max: auctionStartMaximum,
      },
    });
  } else if (auctionStartMinimum) {
    rules.push({
      field: "auction_start",
      operator: "gte",
      value: auctionStartMinimum,
    });
  } else if (auctionStartMaximum) {
    rules.push({
      field: "auction_start",
      operator: "lte",
      value: auctionStartMaximum,
    });
  }

  return {
    match: "and",
    rules,
  };
}

export function formatMilesFromKm(kilometers) {
  if (kilometers === null || kilometers === undefined) {
    return "N/A";
  }

  return `${Math.round(kilometers * KM_TO_MILES).toLocaleString()} mi`;
}

export function formatCurrency(value) {
  if (value === null || value === undefined) {
    return "N/A";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatAuctionDate(value) {
  if (!value) {
    return "Schedule unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatRangeHint(field, metadata) {
  if (!metadata) {
    return "";
  }

  if (field.displayAsMiles) {
    const minimum = metadata.min === null || metadata.min === undefined
      ? null
      : Math.round(metadata.min * KM_TO_MILES).toLocaleString();
    const maximum = metadata.max === null || metadata.max === undefined
      ? null
      : Math.round(metadata.max * KM_TO_MILES).toLocaleString();

    if (minimum && maximum) {
      return `${minimum} - ${maximum} mi`;
    }
  }

  if (field.prefix && metadata.min !== null && metadata.max !== null) {
    return `${field.prefix}${Math.round(metadata.min).toLocaleString()} - ${field.prefix}${Math.round(metadata.max).toLocaleString()}`;
  }

  if (metadata.min !== null && metadata.max !== null) {
    return `${metadata.min} - ${metadata.max}`;
  }

  return "";
}
