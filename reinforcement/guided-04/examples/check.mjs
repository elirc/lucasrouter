import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeUpdates as subject } from '../../interview-03/_interviewer/reference.mjs';
const examples=[
  {
    "label": "Mixed newer, older, and unknown updates",
    "args": [
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
    ],
    "expected": {
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
  },
  {
    "label": "Equal version does not overwrite content",
    "args": [
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
    ],
    "expected": {
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
  },
  {
    "label": "No deliveries preserves the empty projection",
    "args": [
      [],
      []
    ],
    "expected": {
      "rows": [],
      "ignored": []
    }
  }
];
function freeze(value) {
  if(value && typeof value==='object') {
    for(const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
for(const example of examples) {
  test(example.label,()=>{
    const args=structuredClone(example.args);
    const before=structuredClone(args);
    freeze(args);
    assert.deepEqual(subject(...args),example.expected);
    assert.deepEqual(args,before);
  });
}
