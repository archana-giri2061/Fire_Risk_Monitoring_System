// sensor.test.ts
// Unit tests for Case 25: sensor duplicate detection.
// Verifies that the isDuplicate() function correctly identifies repeated
// sequence numbers from IoT devices, preventing the same reading from
// being stored more than once in iot_sensor_readings.

export {};

// In-memory set that tracks which sequence numbers have already been seen.
// In production this check is done against the database using a UNIQUE
// constraint on (device_id, sensor_id, seq) — this set simulates that logic
// in isolation without requiring a database connection.
const seenSequences = new Set<number>();

// Returns true if this sequence number has already been processed,
// false if it is new. Adds the seq to the seen set on first encounter
// so subsequent calls with the same value are correctly identified as duplicates.
function isDuplicate(seq: number): boolean {
  if (seenSequences.has(seq)) return true;
  seenSequences.add(seq);
  return false;
}

// Clears the seen set between tests so each test case starts with
// a clean state and prior submissions do not affect later assertions.
function resetSeenSequences(): void {
  seenSequences.clear();
}


describe("Case 25 — Sensor Duplicate Detection", () => {

  // Reset seen sequences before every test so submissions from one
  // test case never bleed into the next
  beforeEach(() => resetSeenSequences());

  test("returns false for new seq and true for duplicate", () => {
    const first  = isDuplicate(101);  // First time seq 101 is seen — should be accepted
    const second = isDuplicate(101);  // Same seq submitted again — should be rejected

    console.log("Case 25a: Duplicate seq");
    console.log("  seq                      :", 101);
    console.log("  1st submission result    :", first,  "— unique, accepted");
    console.log("  2nd submission result    :", second, "— duplicate, rejected");
    console.log("  Set size after           :", seenSequences.size);

    expect(first).toBe(false);   // First submission is not a duplicate
    expect(second).toBe(true);   // Second submission with same seq is a duplicate
  });

  test("returns false for a brand-new seq number", () => {
    const result = isDuplicate(999);  // Seq 999 has never been seen

    console.log("Case 25b: Unique seq");
    console.log("  seq                      :", 999);
    console.log("  isDuplicate result       :", result, "— unique, accepted");
    console.log("  Added to seen set        :", seenSequences.has(999));

    expect(result).toBe(false);              // New seq is not a duplicate
    expect(seenSequences.has(999)).toBe(true); // Seq must be added to the set after first call
  });

  test("correctly handles mixed duplicate and unique submissions", () => {
    const r1 = isDuplicate(50);  // New — accepted
    const r2 = isDuplicate(51);  // New — accepted
    const r3 = isDuplicate(50);  // Duplicate of seq 50 — rejected
    const r4 = isDuplicate(52);  // New — accepted
    const r5 = isDuplicate(51);  // Duplicate of seq 51 — rejected

    console.log("Case 25c: Mixed submissions");
    console.log("  seq 50 (1st)             :", r1, "— accepted");
    console.log("  seq 51 (1st)             :", r2, "— accepted");
    console.log("  seq 50 (2nd) duplicate   :", r3, "— rejected");
    console.log("  seq 52 (1st)             :", r4, "— accepted");
    console.log("  seq 51 (2nd) duplicate   :", r5, "— rejected");
    console.log("  Set size (unique only)   :", seenSequences.size);

    expect(r1).toBe(false);  // seq 50 first seen
    expect(r2).toBe(false);  // seq 51 first seen
    expect(r3).toBe(true);   // seq 50 duplicate
    expect(r4).toBe(false);  // seq 52 first seen
    expect(r5).toBe(true);   // seq 51 duplicate

    // Only 3 unique sequence numbers were submitted (50, 51, 52)
    expect(seenSequences.size).toBe(3);
  });

  test("seq 0 edge case is handled correctly", () => {
    const first  = isDuplicate(0);  // Seq 0 is a valid value — must not be treated as falsy
    const second = isDuplicate(0);  // Same seq submitted again — should be rejected

    console.log("Case 25d: Edge Case seq 0");
    console.log("  seq                      :", 0);
    console.log("  1st submission result    :", first,  "— unique, accepted");
    console.log("  2nd submission result    :", second, "— duplicate, rejected");

    // Seq 0 must be handled the same as any other value —
    // the falsy nature of 0 in JavaScript must not cause it to be skipped
    expect(first).toBe(false);
    expect(second).toBe(true);
  });
});