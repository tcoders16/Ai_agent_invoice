import sys
import os
import json
import easyocr

def main():
    """
    Usage:
        python readImages.py <image_folder> <output_folder>

    This script will read all .png, .jpg, .jpeg images from <image_folder>,
    extract text using EasyOCR, and store each result as a JSON file in <output_folder>.
    """

    if len(sys.argv) < 3:
        print("Usage: python readImages.py <image_folder> <output_folder>")
        sys.exit(1)

    image_folder = sys.argv[1]
    output_folder = sys.argv[2]

    # Create the output folder if it doesn't exist
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)

    # Initialize the EasyOCR reader (English only here, but you can add more languages)
    reader = easyocr.Reader(['en'])

    # Iterate over each image file in the image folder
    for filename in os.listdir(image_folder):
        if filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            image_path = os.path.join(image_folder, filename)
            print(f"\nProcessing: {filename}")

            # Extract text from the image
            result = reader.readtext(image_path, detail=0)

            # Prepare a JSON structure for the extracted text
            output_data = {
                "image_file": filename,
                "extracted_text": result
            }

            # Construct an output JSON filename
            base_name, _ = os.path.splitext(filename)
            output_filename = f"{base_name}_ocr.json"
            output_path = os.path.join(output_folder, output_filename)

            # Write the extracted text to the output folder as JSON
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(output_data, f, indent=2, ensure_ascii=False)

            print(f"✔ Saved OCR result to: {output_filename}")

if __name__ == "__main__":
    main()