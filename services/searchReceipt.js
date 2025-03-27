import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { exec, spawn } from 'child_process';

// Get the directory name of the current module (ES Modules equivalent of __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

if (!process.env.OPENAI_API_KEY) {
  console.error("❌ Error: OPENAI_API_KEY is not set in the .env file.");
  process.exit(1);
}

console.log("🔍 Debug: OPENAI_API_KEY loaded. Initializing OpenAI client...");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

let processedImages = {};

async function getAudioInputFromPython() {
  return new Promise((resolve, reject) => {
    const pythonPath = path.resolve(__dirname, '../python/audiocheck.py');
    console.log(`📝 Looking for Python file at: ${pythonPath}`);  

    console.log("🎙️ Now Listening... Please speak your command.");

    const pythonProcess = spawn('/Users/omkumarsolanki/Documents/Learnings/Ai_Agent_Invoice/Ai_agent_invoice/.venv/bin/python', [pythonPath]);

    let output = '';

    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`❌ Error from Python: ${data.toString()}`);
      reject(data.toString());
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(`Python process exited with code ${code}`);
      } else {
        let recordedText = output.trim();
        console.log(`🎤 Recorded Text: ${recordedText}`);
        
        // Send recorded text to OpenAI for smart interpretation
        interpretSpokenNumber(recordedText).then(convertedText => {
          console.log(`🎤 Processed Recorded Text (After AI): ${convertedText}`);
          resolve(convertedText);
        }).catch(error => {
          console.error("❌ Error interpreting speech with OpenAI:", error);
          resolve(recordedText);  // Fallback to raw text if API call fails
        });
      }
    });
  });
}

async function interpretSpokenNumber(text) {
  try {
    console.log("🤖 Sending recorded text to OpenAI for interpretation...");

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant that converts speech descriptions of numbers to their digit format. 
          If the user mentions any receipt selection like "open number two", "I select number four", 
          "The second one", "Let's go for the first one", "Choose the third one", etc., 
          respond ONLY with the number like "2", "4", "1", "3". 
          If the user says something unrelated, respond with "INVALID".`
        },
        { role: "user", content: text }
      ],
      temperature: 0.0  // Ensuring deterministic responses
    });

    const aiResponse = response.choices[0].message.content.trim();

    if (aiResponse === "INVALID") {
      console.log("🤖 AI Interpretation: No valid number detected.");
      return text;  // Return the original text if the AI couldn't detect a valid number
    }

    return aiResponse;  // Return the interpreted number as a string
  } catch (error) {
    console.error("❌ Error with OpenAI API:", error.message);
    return text;  // Fallback to original text if something goes wrong
  }
}
async function extractKeywordsFromPrompt(userPrompt) {
  try {
    console.log("🔍 Extracting Keywords from your speech...");

    const systemMessage = {
      role: "system",
      content: "Extract the important keywords from the following text and output ONLY a JSON array of keywords. For example, if the text is 'medtronic as company name', output [\"medtronic\"]."
    };

    const userMessage = { role: "user", content: userPrompt };

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [systemMessage, userMessage],
    });

    const jsonString = response.choices[0].message.content.trim();
    const keywords = JSON.parse(jsonString);

    if (Array.isArray(keywords)) {
      return keywords; // Return only the array if it's properly parsed
    } else if (keywords.keywords) {
      return keywords.keywords; // In case the response is wrapped in { keywords: [...] }
    } else {
      console.error("❌ Unexpected keyword format received:", keywords);
      return []; // Return an empty array if parsing fails
    }
  } catch (error) {
    console.error("❌ Error extracting keywords:", error.message);
    return userPrompt.split(" "); // Fallback: split prompt by words
  }
}
function searchReceiptsInOutput(keywords) {
  console.log("🔍 Searching for matching receipts...");
  const outputFolder = path.resolve(__dirname, "../output");
  const files = fs.readdirSync(outputFolder).filter(f => f.endsWith("_ocr.json"));
  let matches = [];

  files.forEach(file => {
    const filePath = path.resolve(outputFolder, file);
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const combinedText = data.extracted_text.join(" ").toLowerCase();
    const matchedKeywords = keywords.filter(kw => combinedText.includes(kw.toLowerCase()));

    if (matchedKeywords.length > 0) {
      matches.push({
        file: file,
        imageFile: data.image_file,
        description: combinedText,
        matchedKeywords
      });
    }
  });

  return matches;
}

function openImage(imageFileName) {
  const imagePath = path.resolve(__dirname, "../image", imageFileName);
  console.log(`🖼️ Opening image: ${imagePath}`);
  exec(`open "${imagePath}"`, (err) => {
    if (err) console.error("❌ Error opening image:", err);
  });
}

function openOCRFile(ocrFileName) {
  const ocrFilePath = path.resolve(__dirname, "../output", ocrFileName);
  console.log(`📄 Opening OCR file: ${ocrFilePath}`);
  exec(`open "${ocrFilePath}"`, (err) => {
    if (err) console.error("❌ Error opening OCR file:", err);
  });
}

async function main() {
  try {
    console.log("🎙️ Starting Speech Recognition Process...");
    const userPrompt = await getAudioInputFromPython();

    if (!userPrompt || userPrompt.trim() === "") {
      console.log("❌ No input received from the audio prompt. Please try again.");
      return;
    }

    console.log(`✅ You said: ${userPrompt}`);

    const keywords = await extractKeywordsFromPrompt(userPrompt);
    console.log("🔍 Extracted Keywords:", keywords);

    const matches = searchReceiptsInOutput(keywords);
    if (matches.length === 0) {
      console.log(`❌ No receipts found matching: "${userPrompt}"`);
      return;
    }

    console.log("\n✅ Found the following matching receipts:");
    matches.forEach((match, index) => {
      console.log(`${index + 1}. ${match.file} (Image: ${match.imageFile}) - Matched Keywords: ${match.matchedKeywords.join(", ")}`);
    });

    console.log("🎙️ Now, speak the number of the receipt you want to work with...");
    const receiptChoice = await getAudioInputFromPython();

    const userChoice = parseInt(receiptChoice);
    if (isNaN(userChoice) || userChoice < 1 || userChoice > matches.length) {
      console.log("❌ Invalid choice. Please try again.");
      return;
    }

    const selectedReceipt = matches[userChoice - 1];
    console.log(`\n✅ You have selected: ${selectedReceipt.file}`);
    console.log("\n📝 Image Description: ", selectedReceipt.description);

    openOCRFile(selectedReceipt.file);
    openImage(selectedReceipt.imageFile);

    // 🔄 Continuous Interaction Loop
    while (true) {
      console.log("🎙️ Now, ask something about the opened receipt or say 'exit' to quit.");
      const userQuestion = await getAudioInputFromPython();

      if (userQuestion.toLowerCase().includes('exit')) {
        console.log("🚪 Exiting the interaction loop. Goodbye!");
        break;
      }

      console.log("\n🤖 Sending your question to OpenAI API...");

      const prompt = `The receipt description is: ${selectedReceipt.description}\nUser asks: ${userQuestion}\nAnswer:`;

      try {
        const response = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            { role: "system", content: "You are an assistant that answers detailed questions about a receipt based on its OCR description." },
            { role: "user", content: prompt }
          ],
        });

        console.log(`\n📝 AI Response: ${response.choices[0].message.content}`);
      } catch (error) {
        console.error("❌ Error getting response from OpenAI:", error.message);
      }
    }

  } catch (error) {
    console.error("❌ Error: ", error);
  }
}

main();

main();