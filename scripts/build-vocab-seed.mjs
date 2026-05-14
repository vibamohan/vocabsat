import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const csvPath = path.join(root, "sat_300_plus_vocab_dataset.csv");
const outputPath = path.join(root, "supabase", "seed.sql");

function parseCsv(source) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }

      row.push(cell);
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function sqlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

const csv = await readFile(csvPath, "utf8");
const [header, ...records] = parseCsv(csv);

if (header.join(",") !== "word,fast_meaning,example_sentence") {
  throw new Error(`Unexpected CSV header: ${header.join(",")}`);
}

const values = records.map(([word, fastMeaning, exampleSentence], index) => {
  if (!word || !fastMeaning || !exampleSentence) {
    throw new Error(`Missing value on CSV data row ${index + 2}`);
  }

  return [
    index + 1,
    sqlString(word.trim()),
    sqlString(fastMeaning.trim()),
    sqlString(exampleSentence.trim()),
  ];
});

const sql = `insert into public.vocab_words (sort_order, word, fast_meaning, example_sentence)
values
${values
  .map(
    ([sortOrder, word, fastMeaning, exampleSentence]) =>
      `  (${sortOrder}, ${word}, ${fastMeaning}, ${exampleSentence})`,
  )
  .join(",\n")}
on conflict (word) do update
set
  sort_order = excluded.sort_order,
  fast_meaning = excluded.fast_meaning,
  example_sentence = excluded.example_sentence,
  source = 'sat_300_plus_vocab_dataset';
`;

await writeFile(outputPath, sql);
