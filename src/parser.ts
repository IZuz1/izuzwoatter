/**
 * Core Donetsk and Makeyevka water schedule parser and calculator.
 * Parses the official website "водадонбасса.рф" and calculates schedules mathematically.
 */

export interface District {
  name: string;
  code: string;
  baseDate: string;
  step?: number; // defaults to 3 on the actual site
}

// Static fallback databases extracted from the live сайт's javascript
export const DONETSK_DISTRICTS: District[] = [
  { name: "Кировский район (общий)", code: "donetsk_kirovskiy0", baseDate: "31.07.2025" },
  { name: "Пролетарский район (общий)", code: "donetsk_proletarskiy0", baseDate: "31.07.2025" },
  { name: "Кировский район", code: "donetsk_kirovskiy1", baseDate: "31.07.2025" },
  { name: "Кировский район", code: "donetsk_kirovskiy2", baseDate: "30.07.2025" },
  { name: "Кировский район", code: "donetsk_kirovskiy3", baseDate: "31.07.2025", step: 2 },
  { name: "Ленинский район", code: "donetsk_leninskiy", baseDate: "31.07.2025" },
  { name: "Пролетарский район", code: "donetsk_proletarskiy1", baseDate: "31.07.2025" },
  { name: "Пролетарский район", code: "donetsk_proletarskiy2", baseDate: "01.08.2025" },
  { name: "Будённовский район", code: "donetsk_budenovskiy1", baseDate: "31.07.2025" },
  { name: "Будённовский район", code: "donetsk_budenovskiy2", baseDate: "01.08.2025" },
  { name: "Киевский район", code: "donetsk_kievskiy", baseDate: "01.08.2025" },
  { name: "Ворошиловский район", code: "donetsk_voroshilovskiy", baseDate: "01.08.2025" },
  { name: "Калининский район", code: "donetsk_kalininskiy", baseDate: "01.08.2025" },
  { name: "Куйбышевский район", code: "donetsk_kuybyshevskiy", baseDate: "01.08.2025" },
  { name: "Петровский район", code: "donetsk_petrovskiy", baseDate: "01.08.2025" }
];

export const MAKEYEVKA_DISTRICTS: District[] = [
  { name: "Червоногвардейский район (общий)", code: "makeevka_chervonogvardeyskiy0", baseDate: "29.07.2025" },
  { name: "Центрально-городской район", code: "makeevka_tsentralno_gorodskoy1", baseDate: "29.07.2025" },
  { name: "Советский район", code: "makeevka_sovetskiy1", baseDate: "29.07.2025" },
  { name: "Горняцкий район", code: "makeevka_gornyatskiy1", baseDate: "29.07.2025" },
  { name: "Червоногвардейский район", code: "makeevka_chervonogvardeyskiy1", baseDate: "29.07.2025" },
  { name: "Центрально-городской район", code: "makeevka_tsentralno_gorodskoy2", baseDate: "30.07.2025" },
  { name: "Кировский район", code: "makeevka_kirovskiy", baseDate: "30.07.2025" },
  { name: "Червоногвардейский район", code: "makeevka_chervonogvardeyskiy2", baseDate: "30.07.2025" },
  { name: "Горняцкий район", code: "makeevka_gornyatskiy2", baseDate: "30.07.2025" },
  { name: "Центрально-городской район", code: "makeevka_tsentralno_gorodskoy3", baseDate: "31.07.2025" },
  { name: "Горняцкий район", code: "makeevka_gornyatskiy3", baseDate: "31.07.2025" },
  { name: "Советский район", code: "makeevka_sovetskiy2", baseDate: "31.07.2025" },
  { name: "Червоногвардейский район", code: "makeevka_chervonogvardeyskiy3", baseDate: "31.07.2025" }
];

export const ALL_DISTRICTS = [...DONETSK_DISTRICTS, ...MAKEYEVKA_DISTRICTS];

/**
 * Calculates water supply dates for a given district.
 * Emulates the client side javascript on xn--80abciaqi6akebeuxa.xn--p1ai exactly.
 * 
 * @param baseDateStr Base date (e.g., "31.07.2025")
 * @param daysCount Number of schedule dates to return (default: 7)
 * @param stepPeriod Periodicity step in days (default: 3)
 */
export function getWaterSchedule(baseDateStr: string, daysCount: number = 7, stepPeriod: number = 3): string[] {
  try {
    const [d, m, y] = baseDateStr.split(".").map(Number);
    const baseDate = new Date(y, m - 1, d);
    baseDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const timeDiff = today.getTime() - baseDate.getTime();
    const daysElapsed = Math.floor(timeDiff / 864e5);
    const periodsElapsed = daysElapsed > 0 ? Math.ceil(daysElapsed / stepPeriod) : 0;

    const nextDate = new Date(baseDate.getTime());
    nextDate.setDate(nextDate.getDate() + periodsElapsed * stepPeriod);

    const schedule: string[] = [];
    for (let k = 0; k < daysCount; k++) {
      const scheduledDate = new Date(nextDate.getTime());
      scheduledDate.setDate(scheduledDate.getDate() + k * stepPeriod);

      const day = ("0" + scheduledDate.getDate()).slice(-2);
      const month = ("0" + (scheduledDate.getMonth() + 1)).slice(-2);
      const year = scheduledDate.getFullYear();
      
      schedule.push(`${day}.${month}.${year}`);
    }
    return schedule;
  } catch (error) {
    console.error("Schedule error:", error);
    return [];
  }
}

/**
 * Determines whether the specified date string (dd.mm.yyyy) represents "today"
 */
export function isTodayWater(schedule: string[]): boolean {
  const today = new Date();
  const day = ("0" + today.getDate()).slice(-2);
  const month = ("0" + (today.getMonth() + 1)).slice(-2);
  const year = today.getFullYear();
  const todayStr = `${day}.${month}.${year}`;
  
  return schedule.includes(todayStr);
}

/**
 * Parses the live website to fetch and extract the up-to-date gX_donetsk and gX_makeyevka arrays.
 * This guarantees the scraper pulls genuine and up-to-date schedule parameters.
 */
export async function scrapeLiveWaterDatabase(): Promise<{ donetsk: District[], makeevka: District[], isScraped: boolean }> {
  try {
    console.log("Starting scrape of водадонбасса.рф...");
    const rootUrl = "https://xn--80abciaqi6akebeuxa.xn--p1ai/water-map";
    
    const rootResponse = await fetch(rootUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://xn--80abciaqi6akebeuxa.xn--p1ai/'
      }
    });

    if (!rootResponse.ok) {
      throw new Error(`HTTP ${rootResponse.status} from water-map portal`);
    }

    const html = await rootResponse.text();
    
    // Find the main-*.js script bundle
    const mainJsMatch = html.match(/src="([^"]*main\.[a-f0-9]+\.js)"/i);
    if (!mainJsMatch) {
      throw new Error("Could not locate main.*.js bundle script in HTML");
    }

    const mainJsUrl = `https://xn--80abciaqi6akebeuxa.xn--p1ai/${mainJsMatch[1].replace(/^\//, "")}`;
    console.log(`Fetching live JS bundle: ${mainJsUrl}`);
    
    const jsResponse = await fetch(mainJsUrl);
    if (!jsResponse.ok) {
      throw new Error(`HTTP ${jsResponse.status} from JS bundle`);
    }

    const js = await jsResponse.text();
    
    // Extractor Regex for gX_donetsk
    const donetskIndex = js.indexOf("const gX_donetsk=");
    if (donetskIndex === -1) {
      throw new Error("Could not find gX_donetsk declaration in JS");
    }
    
    const donetskEnd = js.indexOf("]", donetskIndex) + 1;
    const donetskBlock = js.slice(donetskIndex, donetskEnd);

    // Parse the districts array using regex matching of objects
    const donetskParsed = extractDistrictsFromBlock(donetskBlock);
    
    // Extractor Regex for gX_makeyevka
    const makeyevkaIndex = js.indexOf("gX_makeyevka=");
    if (makeyevkaIndex === -1) {
      throw new Error("Could not find gX_makeyevka declaration in JS");
    }
    const makeyevkaEnd = js.indexOf("]", makeyevkaIndex) + 1;
    const makeyevkaBlock = js.slice(makeyevkaIndex, makeyevkaEnd);
    const makeyevkaParsed = extractDistrictsFromBlock(makeyevkaBlock);

    if (donetskParsed.length > 0) {
      console.log(`Successfully scraped! Found ${donetskParsed.length} Donetsk and ${makeyevkaParsed.length} Makeyevka districts.`);
      return {
        donetsk: donetskParsed,
        makeevka: makeyevkaParsed,
        isScraped: true
      };
    }
    
    throw new Error("Extracted arrays are empty");
  } catch (error: any) {
    console.warn(`Scrape failed: ${error.message}. Using dynamic fallback database.`);
    return {
      donetsk: DONETSK_DISTRICTS,
      makeevka: MAKEYEVKA_DISTRICTS,
      isScraped: false
    };
  }
}

/**
 * Extractor helper to turn a JS declaration string of array into District objects
 */
function extractDistrictsFromBlock(block: string): District[] {
  const list: District[] = [];
  // Matches structured objects like {name:"...",code:"...",baseDate:"..."} or with step:
  const objRegex = /\{name:"([^"]+)",code:"([^"]+)",baseDate:"([^"]+)"(?:,step:(\d+))?\}/g;
  let match;
  while ((match = objRegex.exec(block)) !== null) {
    const d: District = {
      name: match[1],
      code: match[2],
      baseDate: match[3],
    };
    if (match[4]) {
      d.step = parseInt(match[4], 10);
    }
    list.push(d);
  }
  return list;
}
