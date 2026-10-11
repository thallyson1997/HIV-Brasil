const aggregatedDataPath = "../DADOS_PUBLICOS/casos_agregados.json";

const geoJsonPath =
  "https://cdn.jsdelivr.net/gh/henriquemalvar/br-geojson@main/dist/municipios/MG.geojson";

/* =========================================================
   CONFIGURAÇÕES
========================================================= */

const monthNames = [
  "Jan", "Fev", "Mar", "Abr",
  "Mai", "Jun", "Jul", "Ago",
  "Set", "Out", "Nov", "Dez"
];


/* =========================================================
   ELEMENTOS DA PÁGINA
========================================================= */

const yearFilter = document.querySelector("#year-filter");

const totalCases = document.querySelector("#total-cases");
const summaryScope = document.querySelector("#summary-scope");
const summaryYear = document.querySelector("#summary-year");

const chartCanvas = document.querySelector("#cases-chart");
const statusMessage = document.querySelector("#status-message");

const mapElement = document.querySelector("#map");
const mapLoading = document.querySelector("#map-loading");

const selectedMunicipality = document.querySelector(
  "#selected-municipality"
);

const selectedMunicipalityName = document.querySelector(
  "#selected-municipality-name"
);

const clearMunicipalityButton = document.querySelector(
  "#clear-municipality"
);

const chartDescription = document.querySelector(
  "#chart-description"
);
const municipalityRanking = document.querySelector(
  "#municipality-ranking"
);
const rankingContext = document.querySelector(
  "#ranking-context"
);
const socialProfileChart = document.querySelector(
  "#social-profile-chart"
);
/* =========================================================
   ESTADO DA APLICAÇÃO
========================================================= */

let monthlyCases = {};
let municipalityCases = {};
let socialProfileByYear = {};
let years = [];

let casesChart = null;
let map = null;
let municipalityLayer = null;

let selectedMunicipalityCode = null;

let geoJsonData = null;
let municipalityNameByCode = {};


/* =========================================================
   UTILITÁRIOS
========================================================= */

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  let text = String(value).trim();

  /*
   * Formatos brasileiros:
   * 1.234,56
   * 1234,56
   *
   * Formatos simples:
   * 1234.56
   */

  if (text.includes(".") && text.includes(",")) {
    text = text
      .replace(/\./g, "")
      .replace(",", ".");
  } else if (text.includes(",")) {
    text = text.replace(",", ".");
  }

  const number = Number(text);

  return Number.isFinite(number)
    ? number
    : null;
}

/* =========================================================
   CÓDIGO DO MUNICÍPIO NO CSV
========================================================= */

function getMunicipalityCode(row) {
  const possibleColumns = [
    "co_mun_res",
    "co_municipio",
    "codigo_ibge",
    "cod_ibge",
    "cod_municipio",
    "municipio_codigo",
    "ibge"
  ];

  for (const column of possibleColumns) {
    if (
      row[column] !== undefined &&
      row[column] !== ""
    ) {
      const value =
        String(row[column]).trim();

      const digits =
        value.replace(/\D/g, "");

      if (digits.length === 7) {
        return digits;
      }
    }
  }

  return null;
}

/* =========================================================
   NOME DO MUNICÍPIO NO CSV
========================================================= */

function getMunicipalityName(row) {
  const possibleColumns = [
    "id_mn_resi",
    "municipio",
    "nome_municipio",
    "no_municipio",
    "no_mun_res",
    "municipio_nome",
    "mun_res",
    "nome_mun"
  ];

  for (const column of possibleColumns) {
    if (
      row[column] !== undefined &&
      row[column] !== ""
    ) {
      return String(row[column]).trim();
    }
  }

  return "Município não identificado";
}

/* =========================================================
   POPULAÇÃO DO MUNICÍPIO
========================================================= */

function getPopulation(row) {
  const possibleColumns = [
    "populacao",
    "população",
    "population",
    "pop_municipio",
    "populacao_municipio"
  ];

  for (const column of possibleColumns) {
    if (
      row[column] !== undefined &&
      row[column] !== ""
    ) {
      const value =
        normalizeNumber(row[column]);

      if (
        value !== null &&
        value > 0
      ) {
        return value;
      }
    }
  }

  return null;
}

/* =========================================================
   FORMATAÇÃO
========================================================= */

function formatNumber(value) {
  return Number(value || 0)
    .toLocaleString("pt-BR");
}

function formatIncidence(value) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return value.toLocaleString(
    "pt-BR",
    {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }
  );
}

/* =========================================================
   CÓDIGO DO MUNICÍPIO NO GEOJSON
========================================================= */

function getGeoJsonMunicipalityCode(feature) {
  const properties =
    feature?.properties || {};

  const possibleValues = [
    properties.cd_geocmu,
    properties.codigo_ibge,
    properties.cod_ibge,
    properties.id
  ];

  for (const value of possibleValues) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      const digits =
        String(value).replace(
          /\D/g,
          ""
        );

      if (digits.length === 7) {
        return digits;
      }
    }
  }

  return null;
}

/* =========================================================
   NOME DO MUNICÍPIO NO GEOJSON
========================================================= */

function getGeoJsonMunicipalityName(feature) {
  const properties =
    feature?.properties || {};

  return (
    properties.nome ||
    properties.name ||
    properties.municipio ||
    "Município"
  );
}

/* =========================================================
   MENSAGEM DE ERRO
========================================================= */

function showError(message) {
  statusMessage.textContent =
    message;

  statusMessage.classList.add(
    "status-error"
  );

  statusMessage.hidden = false;

  chartCanvas.hidden = true;
}

/* =========================================================
   PROCESSAMENTO DOS DADOS
========================================================= */

function processData(data) {
  monthlyCases = {};
  municipalityCases = {};
  socialProfileByYear = {};
  const publicYears = data?.years;

  if (data?.schemaVersion !== 1 || !publicYears) {
    throw new Error("Formato dos dados agregados não reconhecido.");
  }

  years = Object.keys(publicYears)
    .sort((first, second) => Number(second) - Number(first));

  for (const year of years) {
    const yearData = publicYears[year];
    monthlyCases[year] = yearData.monthlyTotals;
    municipalityCases[year] = Object.fromEntries(
      yearData.municipalities.map((municipality) => [
        municipality.key,
        municipality
      ])
    );
    socialProfileByYear[year] = yearData.socialProfile;
  }
}

/* =========================================================
   TOTAL DO ANO
========================================================= */

function getYearTotal(year) {
  const counts =
    monthlyCases[year];

  if (!counts) {
    return 0;
  }

  return counts.reduce(
    (sum, count) =>
      sum + count,
    0
  );
}

/* =========================================================
   DADOS DO MUNICÍPIO
========================================================= */

function getMunicipalityData(
  year,
  code
) {
  const municipalityKey =
    municipalityNameByCode[code] || code;

  if (
    !municipalityCases[year] ||
    !municipalityCases[year][municipalityKey]
  ) {
    return null;
  }

  return municipalityCases[year][municipalityKey];
}

/* =========================================================
   RESUMO
========================================================= */

function updateSummary(year) {
  const municipalityData = selectedMunicipalityCode
    ? getMunicipalityData(year, selectedMunicipalityCode)
    : null;

  totalCases.textContent =
    selectedMunicipalityCode && !municipalityData
      ? "—"
      : formatNumber(municipalityData?.total ?? getYearTotal(year));

  summaryScope.textContent = selectedMunicipalityCode
    ? municipalityData
      ? `em ${municipalityData.name} no ano de`
      : `dados não exibidos no ano de`
    : "no ano de";

  summaryYear.textContent =
    year;

  updateMunicipalityRanking(year);
}

function updateSocialProfile(year) {
  const profile = socialProfileByYear[year];
  socialProfileChart.replaceChildren();

  if (!profile) {
    socialProfileChart.textContent =
      "Não há informações de perfil disponíveis para este ano.";
    return;
  }

  const dimensions = [
    { key: "sex", label: "Sexo registrado" },
    { key: "age", label: "Faixa etária" },
    { key: "race", label: "Raça/cor" }
  ];
  const minimumVisibleCount = 10;
  const colors = [
    "#22836f",
    "#d09348",
    "#447c9b",
    "#bd675d",
    "#7a8f4f",
    "#886aa8",
    "#738078"
  ];

  for (const [dimensionIndex, dimension] of dimensions.entries()) {
    const entries = Object.entries(profile[dimension.key]);
    const visible = entries.filter(([, count]) => count >= minimumVisibleCount);
    const suppressedTotal = entries
      .filter(([, count]) => count < minimumVisibleCount)
      .reduce((sum, [, count]) => sum + count, 0);

    if (suppressedTotal >= minimumVisibleCount) {
      visible.push(["Outras categorias", suppressedTotal]);
    }

    visible.sort((first, second) => second[1] - first[1]);
    const total = visible.reduce((sum, [, count]) => sum + count, 0);
    const section = document.createElement("section");
    const heading = document.createElement("div");
    const title = document.createElement("h3");
    const sampleSize = document.createElement("span");
    const bar = document.createElement("div");
    const legend = document.createElement("ul");

    section.className = "profile-dimension";
    heading.className = "profile-dimension-heading";
    title.textContent = dimension.label;
    sampleSize.className = "profile-sample-size";
    sampleSize.textContent = `n = ${formatNumber(total)}`;
    heading.append(title, sampleSize);

    bar.className = "profile-stacked-bar";
    bar.setAttribute("role", "img");
    bar.setAttribute(
      "aria-label",
      `${dimension.label}: ${visible.map(([label, count]) => `${label}, ${formatNumber(count)}`).join("; ")}`
    );

    legend.className = "profile-legend";

    visible.forEach(([label, count], index) => {
      const percentage = total ? count / total * 100 : 0;
      const segment = document.createElement("span");
      const item = document.createElement("li");
      const swatch = document.createElement("span");
      const category = document.createElement("span");
      const value = document.createElement("span");

      segment.className = "profile-bar-segment";
      segment.style.width = `${percentage}%`;
      segment.style.backgroundColor = colors[(dimensionIndex * 2 + index) % colors.length];
      segment.title = `${label}: ${formatNumber(count)} (${percentage.toFixed(1)}%)`;
      segment.setAttribute("aria-hidden", "true");
      bar.append(segment);

      item.className = "profile-legend-item";
      swatch.className = "profile-swatch";
      swatch.style.backgroundColor = colors[(dimensionIndex * 2 + index) % colors.length];
      swatch.setAttribute("aria-hidden", "true");
      category.className = "profile-category";
      category.textContent = label;
      value.className = "profile-value";
      value.textContent = `${formatNumber(count)} · ${percentage.toFixed(1)}%`;
      item.append(swatch, category, value);
      legend.append(item);
    });

    section.append(heading, bar, legend);
    socialProfileChart.append(section);
  }
}

function updateMunicipalityRanking(year) {
  const ranking = Object.entries(municipalityCases[year] || {})
    .map(([key, municipality]) => ({
      key,
      ...municipality
    }))
    .sort((first, second) =>
      second.total - first.total ||
      (second.latestMonthCases ?? 0) - (first.latestMonthCases ?? 0) ||
      (second.latestDayCases ?? 0) - (first.latestDayCases ?? 0) ||
      first.name.localeCompare(second.name, "pt-BR", { sensitivity: "base" }) ||
      first.key.localeCompare(second.key)
    );

  let visibleRanking = ranking.slice(0, 10);
  let selectedIndex = -1;

  if (selectedMunicipalityCode) {
    const selectedKey =
      municipalityNameByCode[selectedMunicipalityCode] ||
      selectedMunicipalityCode;

    selectedIndex = ranking.findIndex(
      (municipality) => municipality.key === selectedKey
    );

    if (selectedIndex >= 0) {
      visibleRanking = ranking.slice(
        Math.max(0, selectedIndex - 4),
        Math.min(ranking.length, selectedIndex + 6)
      );

      rankingContext.textContent =
        `Posição ${selectedIndex + 1} de ${ranking.length}. Exibindo até 4 municípios acima e 5 abaixo.`;
    } else {
      rankingContext.textContent =
        "Município fora do ranking público. Contagens abaixo de 10 não são exibidas.";
    }
  } else {
    rankingContext.textContent =
      "Top 10 do ano. Desempate pelo último mês e dia divulgados; valores suprimidos seguem ordem alfabética.";
  }

  municipalityRanking.replaceChildren();

  for (const municipality of visibleRanking) {
    const rank = ranking.indexOf(municipality) + 1;
    const item = document.createElement("li");
    const position = document.createElement("span");
    const name = document.createElement("span");
    const total = document.createElement("span");

    item.className = "ranking-item";
    if (rank === selectedIndex + 1 && selectedIndex >= 0) {
      item.classList.add("ranking-item-selected");
      item.setAttribute("aria-current", "true");
    }

    position.className = "ranking-position";
    position.textContent = `${rank}.`;
    name.className = "ranking-name";
    name.textContent = municipality.name;
    total.className = "ranking-total";
    total.textContent = formatNumber(municipality.total);

    item.append(position, name, total);
    municipalityRanking.append(item);
  }
}

/* =========================================================
   GRÁFICO
========================================================= */

function renderChart(
  year,
  municipalityCode = null
) {
  let values;

  if (municipalityCode) {
    const municipalityData =
      getMunicipalityData(
        year,
        municipalityCode
      );

    if (municipalityData) {
      values =
        municipalityData.months;
    } else {
      values =
        Array(12).fill(null);
    }
  } else {
    values =
      monthlyCases[year] ||
      Array(12).fill(0);
  }

  statusMessage.hidden = true;

  chartCanvas.hidden = false;

  /*
   * Se o gráfico já existe,
   * apenas atualiza os valores.
   */

  if (casesChart) {
    casesChart.data.datasets[0]
      .data = values;

    casesChart.update();

    return;
  }

  /*
   * Cria o gráfico.
   */

  casesChart =
    new Chart(
      chartCanvas,
      {
        type: "bar",

        data: {
          labels: monthNames,

          datasets: [
            {
              data: values,

              backgroundColor:
                "#22836f",

              hoverBackgroundColor:
                "#155d50",

              borderRadius: 3,

              maxBarThickness: 34
            }
          ]
        },

        options: {
          maintainAspectRatio: false,

          responsive: true,

          plugins: {
            legend: {
              display: false
            },

            tooltip: {
              displayColors: false,

              callbacks: {
                label:
                  (context) =>
                    `${formatNumber(
                      context.raw
                    )} notificações`
              }
            }
          },

          scales: {
            x: {
              grid: {
                display: false
              },

              border: {
                display: false
              },

              ticks: {
                color: "#68756e",

                font: {
                  family: "DM Sans",
                  size: 12
                }
              }
            },

            y: {
              beginAtZero: true,

              border: {
                display: false,

                dash: [3, 4]
              },

              grid: {
                color: "#e6ebe6",

                drawTicks: false
              },

              ticks: {
                color: "#8b958f",

                padding: 10,

                precision: 0,

                font: {
                  family: "DM Sans",
                  size: 11
                },

                callback:
                  (value) =>
                    Number(value)
                      .toLocaleString(
                        "pt-BR"
                      )
              }
            }
          }
        }
      }
    );
}

/* =========================================================
   ATUALIZAÇÃO DO GRÁFICO
========================================================= */

function updateChart(year) {
  if (selectedMunicipalityCode) {
    renderChart(
      year,
      selectedMunicipalityCode
    );

    const municipalityData =
      getMunicipalityData(
        year,
        selectedMunicipalityCode
      );

    if (municipalityData) {
      chartDescription.textContent =
        `Notificações mensais em ${municipalityData.name}; contagens abaixo de 10 omitidas`;
    } else {
      chartDescription.textContent =
        "Dados municipais não exibidos para proteger a privacidade";
    }

    return;
  }

  renderChart(year);

  chartDescription.textContent =
    "Notificações registradas em cada mês";
}

/* =========================================================
   VALOR DO MAPA
========================================================= */

function getMapValue(
  year,
  municipalityCode
) {
  const data =
    getMunicipalityData(
      year,
      municipalityCode
    );

  if (!data) {
    return 0;
  }

  return data.total;
}

/* =========================================================
   MAIOR VALOR DO MAPA
========================================================= */

function getMapMax(year) {
  let max = 0;

  const municipalities =
    municipalityCases[year] || {};

  for (
    const code of Object.keys(
      municipalities
    )
  ) {
    const value =
      getMapValue(
        year,
        code
      );

    if (value > max) {
      max = value;
    }
  }

  return max;
}

/* =========================================================
   ESCALA DE CORES
========================================================= */

function getColor(
  value,
  max
) {
  if (
    !value ||
    value <= 0
  ) {
    return "#edf4ef";
  }

  if (
    !max ||
    max <= 0
  ) {
    return "#edf4ef";
  }

  const ratio =
    value / max;

  if (ratio <= 0.2) {
    return "#c9e2d4";
  }

  if (ratio <= 0.4) {
    return "#8fc5ad";
  }

  if (ratio <= 0.6) {
    return "#4e9d83";
  }

  if (ratio <= 0.8) {
    return "#347f6b";
  }

  return "#236f5d";
}

/* =========================================================
   ESTILO DOS MUNICÍPIOS
========================================================= */

function municipalityStyle(feature) {
  const year =
    yearFilter.value;

  const code =
    getGeoJsonMunicipalityCode(
      feature
    );

  const value =
    code
      ? getMapValue(
          year,
          code
        )
      : 0;

  const max =
    getMapMax(year);

  const isSelected =
    selectedMunicipalityCode ===
    code;

  const isDimmed =
    selectedMunicipalityCode &&
    !isSelected;

  return {
    fillColor:
      getColor(
        value,
        max
      ),

    weight:
      isSelected
        ? 3
        : 0.7,

    opacity:
      isDimmed
        ? 0.45
        : 1,

    color:
      isSelected
        ? "#153f35"
        : "#ffffff",

    fillOpacity:
      isSelected
        ? 1
        : isDimmed
          ? 0.35
          : 0.88
  };
}

/* =========================================================
   POPUP
========================================================= */

function createPopupContent(
  year,
  municipalityCode,
  featureName
) {
  const data =
    getMunicipalityData(
      year,
      municipalityCode
    );

  const name =
    data?.name ||
    featureName ||
    "Município";

  if (!data) {
    return `
      <div class="map-popup-title">${name}</div>
      <div class="map-popup-value">Contagem não exibida para proteger a privacidade.</div>
    `;
  }

  return `
    <div class="map-popup-title">
      ${name}
    </div>

    <div class="map-popup-value">
      ${formatNumber(data.total)} notificações em ${year}
    </div>
  `;
}

/* =========================================================
   INICIALIZAÇÃO DO MAPA
========================================================= */

function initializeMap() {
  if (!mapElement) {
    console.error(
      "Elemento #map não encontrado."
    );

    return;
  }

  map =
    L.map(
      "map",
      {
        zoomControl: true,

        attributionControl: true,

        minZoom: 6,

        maxZoom: 10
      }
    );

  /*
   * Centro aproximado de Minas Gerais.
   */

  map.setView(
    [-18.5, -44.5],
    6
  );

  /*
   * Não utilizamos mapa de fundo.
   */

  loadGeoJson();
}

/* =========================================================
   CARREGA GEOJSON
========================================================= */

async function loadGeoJson() {
  try {
    mapLoading.hidden =
      false;

    const response =
      await fetch(
        geoJsonPath
      );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    geoJsonData =
      await response.json();

    municipalityNameByCode = {};

    for (const feature of geoJsonData.features) {
      const code =
        getGeoJsonMunicipalityCode(feature);

      const name =
        getGeoJsonMunicipalityName(feature);

      if (code && name) {
        municipalityNameByCode[code] =
          normalizeText(name);
      }
    }

    renderMunicipalityLayer();

    mapLoading.hidden =
      true;

  } catch (error) {
    console.error(
      "Erro ao carregar o mapa:",
      error
    );

    mapLoading.textContent =
      "Não foi possível carregar o mapa dos municípios.";

    mapLoading.classList.add(
      "status-error"
    );
  }
}

/* =========================================================
   RENDERIZA MUNICÍPIOS
========================================================= */

function renderMunicipalityLayer() {
  if (!geoJsonData) {
    return;
  }

  if (municipalityLayer) {
    municipalityLayer.remove();
  }

  const year =
    yearFilter.value;

  municipalityLayer =
    L.geoJSON(
      geoJsonData,
      {
        style:
          municipalityStyle,

        onEachFeature:
          (
            feature,
            layer
          ) => {
            const code =
              getGeoJsonMunicipalityCode(
                feature
              );

            const municipalityName =
              getGeoJsonMunicipalityName(
                feature
              );

            if (!code) {
              return;
            }

            layer.bindPopup(
              createPopupContent(
                year,
                code,
                municipalityName
              )
            );

            layer.on({
              mouseover:
                (event) => {
                  const target =
                    event.target;

                  const isSelected =
                    selectedMunicipalityCode ===
                    code;

                  target.setStyle({
                    weight:
                      isSelected
                        ? 3
                        : 2,

                    color:
                      "#153f35",

                    fillOpacity: 1
                  });

                  target.bringToFront();
                },

              mouseout:
                (event) => {
                  /*
                   * Reaplica o estilo correto.
                   */

                  event.target.setStyle(
                    municipalityStyle(
                      feature
                    )
                  );
                },

              click:
                () => {
                  selectMunicipality(
                    code,
                    municipalityName
                  );
                }
            });
          }
      }
    )
    .addTo(map);
}

/* =========================================================
   SELEÇÃO DE MUNICÍPIO
========================================================= */

function selectMunicipality(
  code,
  name
) {
  selectedMunicipalityCode =
    code;

  /*
   * Atualiza o mapa.
   */

  if (municipalityLayer) {
    municipalityLayer.eachLayer(
      (layer) => {
        const layerCode =
          getGeoJsonMunicipalityCode(
            layer.feature
          );

        if (layerCode === code) {
          layer.setStyle({
            weight: 3,

            opacity: 1,

            color: "#153f35",

            fillOpacity: 1
          });

          layer.bringToFront();

        } else {
          layer.setStyle({
            opacity: 0.45,

            fillOpacity: 0.35,

            weight: 0.5,

            color: "#ffffff"
          });
        }
      }
    );
  }

  /*
   * Mostra município selecionado.
   */

  selectedMunicipalityName.textContent =
    name;

  selectedMunicipality.hidden =
    false;

  const year =
    yearFilter.value;

  updateSummary(year);

  /*
   * Atualiza gráfico.
   */

  updateChart(year);

  /*
   * Abre popup.
   */

  if (municipalityLayer) {
    municipalityLayer.eachLayer(
      (layer) => {
        const layerCode =
          getGeoJsonMunicipalityCode(
            layer.feature
          );

        if (layerCode === code) {
          layer.openPopup();
        }
      }
    );
  }
}

/* =========================================================
   LIMPA SELEÇÃO
========================================================= */

function clearMunicipalitySelection() {
  selectedMunicipalityCode =
    null;

  selectedMunicipality.hidden =
    true;

  updateSummary(yearFilter.value);

  chartDescription.textContent =
    "Notificações registradas em cada mês";

  updateChart(
    yearFilter.value
  );

  if (municipalityLayer) {
    municipalityLayer.eachLayer(
      (layer) => {
        layer.setStyle(
          municipalityStyle(
            layer.feature
          )
        );
      }
    );
  }
}

/* =========================================================
   MUDA O ANO
========================================================= */

function changeYear(year) {
  if (!monthlyCases[year]) {
    return;
  }

  updateSummary(year);
  updateSocialProfile(year);

  /*
   * Redesenha o mapa para atualizar
   * as cores do novo ano.
   */

  if (geoJsonData) {
    renderMunicipalityLayer();
  }

  /*
   * Mantém o município selecionado.
   */

  updateChart(year);

}

/* =========================================================
   EVENTO DO FILTRO DE ANO
========================================================= */

yearFilter.addEventListener(
  "change",
  (event) => {
    changeYear(
      event.target.value
    );
  }
);

/* =========================================================
   EVENTO DE LIMPAR MUNICÍPIO
========================================================= */

clearMunicipalityButton.addEventListener(
  "click",
  clearMunicipalitySelection
);

/* =========================================================
   CARREGAMENTO DOS DADOS AGREGADOS
========================================================= */

async function loadPublicData() {
  try {
    const response = await fetch(aggregatedDataPath);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    processData(await response.json());

    if (!years.length) {
      throw new Error("O arquivo agregado não contém anos válidos.");
    }

    yearFilter.replaceChildren(
      ...years.map((year) => new Option(year, year))
    );

    yearFilter.value = monthlyCases["2026"] ? "2026" : years[0];
    yearFilter.disabled = false;

    updateSummary(yearFilter.value);
    updateSocialProfile(yearFilter.value);
    renderChart(yearFilter.value);
    initializeMap();
  } catch (error) {
    console.error("Erro ao carregar os dados públicos:", error);
    showError("Não foi possível carregar os dados agregados do painel.");
  }
}

loadPublicData();