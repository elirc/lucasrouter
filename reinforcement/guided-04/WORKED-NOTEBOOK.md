# Runnable worked notebook: Watch a stop projection accept and reject deliveries

This notebook adds three solved examples around the existing `mergeUpdates` teaching reference. It preserves the earlier unfinished starter. Reading or running these solved examples is study, not an independent completion of that exercise.

## Contract and owner

Rows are validated unique {id,version,status} records, and updates have the same shape with nonnegative integer versions. Return {rows,ignored}. Preserve original row order. For each update in arrival order, accept only a known ID with a strictly newer version than its currently accepted version. Replace that record with the update object. Otherwise append its ID to ignored, including repeated IDs. Return a new array; preserve unchanged record identity and never mutate either input. Unknown IDs are ignored, not inserted. This projection is not a durable concurrency mechanism.

The [original coding exercise](../interview-03/coding/README.md) contains the complete practice workflow. The [reference source](../interview-03/_interviewer/reference.mjs) is deliberately separate from the starter. The new runner imports that reference and checks the literal expected values printed below; it does not call the live application.

## A slow walk through the main example

The map begins with A at version1 and B at version3. A2 replaces A1. A1 arriving afterward is ignored because the accepted A is already version2. B4 replaces B3. Z is not in the original identity set, so it is recorded as ignored instead of inserted. Reconstructing through the original rows preserves A-before-B order even though the update stream could be reordered.

**The distinction to retain:** The interesting state is the latest accepted version inside this batch, not just the version in the original array.

Before looking at code, draw the state after each meaningful step. If the operation maintains an index or a set, write what enters it and what its key means. If it makes a transition decision, write the branch order and the first branch that accepts or rejects the input. These two ways of tracing make hidden assumptions more visible than jumping straight from input to final output.

Do not change the expected result merely to match an implementation. When there is a disagreement, return to the written contract. Decide whether the input violates a stated precondition, the expectation misreads a policy, or the implementation fails the rule. Each possibility leads to different corrective work.

## Example 1: Mixed newer, older, and unknown updates

Arguments, in parameter order:

```json
[
  [
    {
      "id": "A",
      "version": 1,
      "status": "pending"
    },
    {
      "id": "B",
      "version": 3,
      "status": "done"
    }
  ],
  [
    {
      "id": "A",
      "version": 2,
      "status": "done"
    },
    {
      "id": "A",
      "version": 1,
      "status": "pending"
    },
    {
      "id": "B",
      "version": 4,
      "status": "failed"
    },
    {
      "id": "Z",
      "version": 1,
      "status": "pending"
    }
  ]
]
```

Expected returned value:

```json
{
  "rows": [
    {
      "id": "A",
      "version": 2,
      "status": "done"
    },
    {
      "id": "B",
      "version": 4,
      "status": "failed"
    }
  ],
  "ignored": [
    "A",
    "Z"
  ]
}
```

Read the arguments before the result. Identify the entity identity, meaningful order, and boundary values. Then compare every result field, including preserved values and empty collections. A partial assertion can miss the exact distinction the example was chosen to expose.


## Example 2: Equal version does not overwrite content

Arguments, in parameter order:

```json
[
  [
    {
      "id": "A",
      "version": 2,
      "status": "done"
    }
  ],
  [
    {
      "id": "A",
      "version": 2,
      "status": "failed"
    }
  ]
]
```

Expected returned value:

```json
{
  "rows": [
    {
      "id": "A",
      "version": 2,
      "status": "done"
    }
  ],
  "ignored": [
    "A"
  ]
}
```

Read the arguments before the result. Identify the entity identity, meaningful order, and boundary values. Then compare every result field, including preserved values and empty collections. A partial assertion can miss the exact distinction the example was chosen to expose.


## Example 3: No deliveries preserves the empty projection

Arguments, in parameter order:

```json
[
  [],
  []
]
```

Expected returned value:

```json
{
  "rows": [],
  "ignored": []
}
```

Read the arguments before the result. Identify the entity identity, meaningful order, and boundary values. Then compare every result field, including preserved values and empty collections. A partial assertion can miss the exact distinction the example was chosen to expose.

## Run the worked examples

From this guided block's `examples` directory:

```powershell
node --test check.mjs
```

Three named checks compare complete returned values and confirm that the supplied argument values remain unchanged. The runner freezes input structures recursively, so accidental mutation is also exposed in these fixtures. It uses Node's built-in test and assertion modules and needs no install, server, database, account, or network call.

The reference function is imported from the preceding interview block. If you move this folder independently, preserve that relative relationship or update the import deliberately. The source link and import target are included in the local navigation checks. This runner does not alter or mark your earlier starter as solved.

## Read the implementation after the trace

Index current records by stable ID, process updates sequentially, and reconstruct output in the original order. The Map stores the latest accepted revision so an older update later in the same batch cannot win. Expected Map operations give O(n+m) time and O(n+m) output/index space including ignored IDs. Sorting by arrival or mutating the input is unnecessary. Equal versions are ignored by this teaching policy; a production system may instead need to diagnose conflicting payloads at one version.

Now connect the explanation to actual lines in the reference. Mark input validation or assumed preconditions, identity construction, the main decision, output construction, and preservation of caller-owned state. Not every helper has every category. If a category is absent because the contract delegates it to the caller, write that rather than imagining hidden validation.

Compare the first example with each variation. Identify the changed dimension before looking at the new result. The empty or boundary case is not an afterthought: it reveals what the function means when ordinary work is absent or when a threshold is exactly reached. A deterministic tie or scope check can be decisive even when most fields look identical.

## From solved reading to independent practice

Close the reference and reconstruct the main decision in a separate practice file. Keep your first attempt, including its mistakes. Add a fourth fixture that rejects a plausible wrong implementation. Write the expected result before execution and explain why it follows from the contract.

If your code differs from the reference, compare behavior rather than spelling. Another loop, data structure, or decomposition can be valid. State its time and space costs and its effect on clarity. Do not add a framework or dependency merely to make the exercise look more advanced.

## Connect the model back to RouteIQ / lucasrouter

The project boundary to inspect is the store action and its persistence boundary. The model can explain a policy while omitting authorization, persistence, browser interaction, or concurrent execution. Locate the real caller and name the missing guarantee before proposing an application change.

An accurate learning journal can say that the three solved examples ran and matched their expected values. It cannot turn that result into a claim that the application was built, deployed, browser-tested, or verified against an external provider. Record your own source trace and integration evidence separately when you perform them.

## Explain it without the code

Use this speaking sequence: the user wants __; the input identifies __; the function preserves __; the surprising branch is __; the result is __; the real application still needs __. Then have a listener change one input. If you can predict the changed result and identify the decisive step, you have evidence of understanding beyond recognizing the reference.
