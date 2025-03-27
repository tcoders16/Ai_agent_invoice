import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import readlineSync from 'readline-sync';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

// Get the directory name of the current module (ES Modules equivalent of __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file (assuming .env is at the project root)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Check if OpenAI API key is loaded
if (!process.env.OPENAI_API_KEY) {
  console.error("❌ Error: OPENAI_API_KEY is not set in the .env file.");
  process.exit(1);
}

console.log("🔍 Debug: OPENAI_API_KEY loaded. Initializing OpenAI client...");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

console.log("✅ OpenAI client initialized successfully.");

// Cache for OCR results so we don't reprocess images
let processedImages = {};

/**
 * Recognizes text from an image using OCR (via OpenAI) and returns the extracted text.
 */
async function recognizeReceipt(imagePath) {
  try {
    if (processedImages[imagePath]) {
      return processedImages[imagePath]; // Return cached result if available
    }
    
    console.log("🔍 Debug: Reading image from path:", imagePath);
    const base64Image = fs.readFileSync(imagePath, "base64");
    console.log("✅ Image read successfully! Sending it to OpenAI API...");

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "What's in this image? Look for details like amounts, dates, vendor names, etc." },
            {
              type: "input_image",
              image_url: `data:image/jpeg;base64,${base64Image}`,
            },
          ],
        },
      ],
    });

    const result = response.output_text;
    processedImages[imagePath] = result; // Cache result
    console.log("🔍 Debug: OCR result:", result);
    return result;
  } catch (error) {
    console.error("❌ Error recognizing image:", error.response?.data || error.message);
    return null;
  }
}

/**
 * Uses ChatGPT to extract important keywords from the user prompt.
 * Expects ChatGPT to return a JSON array of keywords.
 */
async function extractKeywordsFromPrompt(userPrompt) {
  try {
    const systemMessage = {
      role: "system",
      content: "Extract the important keywords from the following text and output ONLY a JSON array of keywords. For example, if the text is 'medtronic as company name', output [\"medtronic\"].",
    };

    const userMessage = { role: "user", content: userPrompt };

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [systemMessage, userMessage],
    });

    const jsonString = response.choices[0].message.content.trim();
    const keywords = JSON.parse(jsonString);
    return keywords;
  } catch (error) {
    console.error("❌ Error extracting keywords:", error.message);
    // Fallback: split prompt by spaces
    return userPrompt.split(" ");
  }
}

/**
 * Searches OCR JSON files in the output folder for receipts that match any of the given keywords.
 */
function searchReceiptsInOutput(keywords) {
  const outputFolder = path.resolve(__dirname, "../output");
  const files = fs.readdirSync(outputFolder).filter(f => f.endsWith("_ocr.json"));
  let matches = [];

  files.forEach(file => {
    const filePath = path.resolve(outputFolder, file);
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    // Combine extracted text for simple matching
    const combinedText = data.extracted_text.join(" ").toLowerCase();
    const matchedKeywords = keywords.filter(kw => combinedText.includes(kw.toLowerCase()));
    if (matchedKeywords.length > 0) {
      matches.push({
        file: file, // OCR JSON file name
        imageFile: data.image_file, // Corresponding image file name (assumed to be included)
        description: combinedText,
        matchedKeywords,
      });
    }
  });

  return matches;
}

/**
 * Opens an image file using the system's default image viewer.
 * For macOS, it uses the "open" command; adjust if using Windows ("start") or Linux ("xdg-open").
 */
function openImage(imageFileName) {
  const imagePath = path.resolve(__dirname, "../image", imageFileName);
  console.log(`Opening image: ${imagePath}`);
  exec(`open "${imagePath}"`, (err, stdout, stderr) => {
    if (err) {
      console.error("❌ Error opening image:", err);
    } else {
      console.log("✅ Image opened successfully.");
    }
  });
}

/**
 * Opens the OCR JSON file corresponding to a receipt using the system's default text editor.
 */
function openOCRFile(ocrFileName) {
  const ocrFilePath = path.resolve(__dirname, "../output", ocrFileName);
  console.log(`Opening OCR file: ${ocrFilePath}`);
  exec(`open "${ocrFilePath}"`, (err, stdout, stderr) => {
    if (err) {
      console.error("❌ Error opening OCR file:", err);
    } else {
      console.log("✅ OCR file opened successfully.");
    }
  });
}

/**
 * Main function:
 * 1. Prompts the user for a receipt detail (e.g., "the one with company name Victor Kumar").
 * 2. Extracts keywords from the prompt.
 * 3. Searches OCR JSON files for matching receipts.
 * 4. If matches are found, opens the corresponding OCR file (to review the receipt details) and image.
 * 5. Enters a chat loop to allow follow-up questions about the receipt.
 */
async function main() {
  const userPrompt = readlineSync.question("\nWhat receipt detail are you looking for? ");
  const keywords = await extractKeywordsFromPrompt(userPrompt);
  console.log("Extracted Keywords:", keywords);

  const matches = searchReceiptsInOutput(keywords);
  if (matches.length === 0) {
    console.log(`❌ No receipts found matching: "${userPrompt}"`);
    return;
  }

  console.log("\nFound the following matching receipts:");
  matches.forEach((match, index) => {
    console.log(`${index + 1}. ${match.file} (Image: ${match.imageFile}) - Matched Keywords: ${match.matchedKeywords.join(", ")}`);
  });

  // Let the user choose one receipt to interact with
  const userChoice = readlineSync.questionInt("\nEnter the number of the receipt you want to work with: ");
  if (userChoice < 1 || userChoice > matches.length) {
    console.log("❌ Invalid choice.");
    return;
  }

  const selectedReceipt = matches[userChoice - 1];
  console.log(`\nYou have selected: ${selectedReceipt.file}`);
  console.log("\nImage Description: ", selectedReceipt.description);

  // Open the OCR file (the JSON) to show the receipt details
  openOCRFile(selectedReceipt.file);

  // Open the receipt image
  openImage(selectedReceipt.imageFile);

  // Enter chat loop to ask follow-up questions about the receipt
  while (true) {
    const userQuestion = readlineSync.question("\nAsk something about the receipt (or type 'exit' to quit): ");
    if (userQuestion.toLowerCase() === 'exit') {
      console.log("Exiting the chat loop...");
      break;
    }

    console.log("\nSending your question to OpenAI API...");

    // Create a prompt for ChatGPT that includes the OCR description and the user's question
    const prompt = `The receipt description is: ${selectedReceipt.description}\nUser asks: ${userQuestion}\nAnswer:`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are an assistant that answers detailed questions about a receipt based on its OCR description.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      });
      console.log("\nChatGPT's answer:", response.choices[0].message.content);
    } catch (error) {
      console.error("❌ Error getting ChatGPT response:", error.message);
    }
  }
}

main();