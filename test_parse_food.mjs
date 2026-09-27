// Guards api/analyze-food.js:parseFood(). A photo of several dishes made Gemini
// answer with an array; the old greedy {...} match turned it into invalid JSON
// ("Unexpected non-whitespace character after JSON").
//   run: node test_parse_food.mjs
import assert from 'node:assert/strict';
import { parseFood } from './api/analyze-food.js';

const dish = (name, calories) => ({ name, calories, carbs: 10, protein: 5, fat: 3, fiber: 1, sodium: 400, note: name });

// single object, plain and fenced
assert.equal(parseFood(JSON.stringify(dish('ข้าวผัด', 500))).calories, 500);
assert.equal(parseFood('```json\n' + JSON.stringify(dish('ข้าวผัด', 500)) + '\n```').name, 'ข้าวผัด');

// the case that broke: a pretty-printed array of dishes
const many = parseFood(JSON.stringify([dish('แกงเขียวหวาน', 250), dish('ไข่พะโล้', 200)], null, 2));
assert.equal(many.name, 'แกงเขียวหวาน, ไข่พะโล้');
assert.equal(many.calories, 450);
assert.equal(many.sodium, 800);

// prose around the JSON still works
assert.equal(parseFood('Here you go: ' + JSON.stringify(dish('ส้มตำ', 120)) + ' enjoy').calories, 120);

console.log('ok — parseFood handles one dish, several dishes, fences and surrounding prose');
