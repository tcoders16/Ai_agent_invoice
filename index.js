import path from 'path';
import fs from 'fs';
import readlineSync from 'readline-sync';
import { recognizeReceipt } from './services/imageReco.js';
import { searchTextFiles } from './services/textSearch.js';
import stringSimilarity from 'string-similarity';

// Function to process all images in the folder and save extracted text to files
async function processImages() {
    const imageFolderPath = path.resolve('./image');
    const files = fs.readdirSync(imageFolderPath);
    const imageFiles = files.filter(file => file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.JPG'));

    if (imageFiles.length === 0) {
        console.log("❌ No images found in the 'image' folder.");
        return;
    }

    for (const imageFile of imageFiles) {
        const imagePath = path.join(imageFolderPath, imageFile);
        console.log(`\n🔍 Processing image: ${imageFile}`);

        const extractedText = await recognizeReceipt(imagePath);

        if (!extractedText) {
            console.log("❌ Failed to process image:", imageFile);
        }
    }
}

async function main() {
    console.log("📌 Step 1: Processing all images...");
    await processImages();

    console.log("\n📌 Step 2: Searching through extracted text files...");
    const userInput = readlineSync.question("Enter a keyword or phrase to search for: ");
    searchTextFiles(userInput);
}

main();