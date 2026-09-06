# Fictional Brand Dataset V0

This package contains fictional companies and their mock brand snapshots only. It contains no product application, interface, source code, dependencies, or generated character assets.

## Files

- `mock-brands.json` — canonical UTF-8 JSON dataset: 28 fictional brands with all fields.
- `mock-brand-index.csv` — the same 28 brands in a spreadsheet-friendly CSV format.

## Dataset contract

Each brand has these fields:

```text
id, name, category, summary, offers, needs, intent,
audience, identity, constraints, characterSeed
```

`id` is stable and suitable as a join key. `characterSeed` is an integer visual seed only; it is not a score or a real identifier.

All company names, summaries, audiences, capabilities and constraints are fictional mock content for product testing. They do not represent real companies or real collaboration recommendations.

## Use

Use `mock-brands.json` as the source of truth. The CSV is supplied for easy review in spreadsheet tools and is equivalent to the JSON data.

The package is a fixed seed-one snapshot containing 28 brands, ranging from experimental design studios and manufacturers to craft, AI, cultural, food, logistics and accounting organisations.
