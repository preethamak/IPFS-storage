import { Web3Storage, getFilesFromPath } from 'web3.storage';
import { create } from "@web3-storage/w3up-client"; 
import { ethers, JsonRpcProvider } from 'ethers';
import * as Constants from "../constant";
import formidable from 'formidable';
import path from 'path';
import fs from 'fs';

export const config = {
    api: {
        bodyParser: false,  // Disable built-in body parser
    },
};

// Move uploaded file to server directory
function moveFileToServer(req) {
    return new Promise((resolve, reject) => {
        const uploadDir = path.join(process.cwd(), "uploads"); // Fixed path
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true }); // Create directory if it doesn't exist
        }

        const options = { 
            uploadDir,
            keepExtensions: true,
            maxFileSize: 50 * 1024 * 1024, // 50MB limit
        };

        const form = formidable(options);

        form.parse(req, (err, fields, files) => {
            if (err) {
                reject(new Error("File upload error: " + err.message));
                return;
            }

            if (!files.file) {
                reject(new Error("No file uploaded"));
                return;
            }

            const file = files.file[0]; // Handle formidable's array structure
            const uniqueFileName = file.newFilename;
            const actualFileName = file.originalFilename;

            resolve({ uniqueFileName, actualFileName, filePath: file.filepath });
        });
    });
}

// Store data in blockchain
async function storeDataInBlockchain(actualFileName, uniqueFileName, filePath) {
    try {
        if (!Constants.API_URL) throw new Error("API_URL is not defined in constants.");
        if (!Constants.PRIVATE_KEY) throw new Error("PRIVATE_KEY is not defined in constants.");

        const provider = new JsonRpcProvider(Constants.API_URL);
        const signer = new ethers.Wallet(Constants.PRIVATE_KEY, provider);
        const StorageContract = new ethers.Contract(Constants.contractAddress, Constants.contractAbi, signer);

        console.log(`Using API URL: ${Constants.API_URL}`);
        console.log(`Checking if file is stored for uniqueFileName: ${uniqueFileName}`);
        const isStored = await StorageContract.isFileStored(uniqueFileName);
        console.log(`File stored status: ${isStored}`);

        if (!isStored) {
            const token = "z4MXj1wBzi9jUstyNenfciAAUkMaK4cPqXeQe56FtUky28Dz4TtUfG7Qyeiu1Z3uF52Gn5exmvFXFEgrQDbRL7ndtPHbQr2TfrPdQHNFxzdHPgiz1iac248qXjdovixL1bx5NdiWng95XrT2X4tvs1ncBtBn9QLSRZjEdpFYASQPisChfWEnQYEw9sQzsJLX2w7rnYdDC9KSqcVH72PGmuoYyLWpbaE1du9BoL2YsmbgAUXXbWcgFpyWfcijzXKGKxveLSJ1ei3V48iPNZA7fG2EqDgF9iPmU2v9EoLgffWBgSAcxR8E2YJaL16Ve7ij1FNTyDEZ256Bxp2BUCo6smP4UxgGJ4Y8nWLgH1D2XxU1CPbrpEkDe";
            if (!token) throw new Error("WEB3STORAGE_TOKEN is not set in environment variables");

            const storage = new Web3Storage({ token });

            console.log(`Uploading file: ${filePath}`);
            const files = await getFilesFromPath(filePath);
            if (files.length === 0) throw new Error(`File not found at path: ${filePath}`);

            console.log("Uploading to IPFS...");
            const cid = await storage.put(files);
            const hash = cid.toString();

            console.log(`Stored in IPFS: ${hash}`);
            const tx = await StorageContract.upload(uniqueFileName, hash);
            console.log(`Transaction hash: ${tx.hash}`);
            await tx.wait();

            return { message: `IPFS hash stored: ${hash}` };
        } else {
            const storedHash = await StorageContract.getIPFSHash(uniqueFileName);
            return { message: `File already exists with IPFS hash: ${storedHash}` };
        }
    } catch (error) {
        console.error("Blockchain Storage Error:", error.message);
        throw new Error(`Failed to store data in blockchain: ${error.message}`);
    }
}

// API Handler
const handler = async (req, res) => {
    try {
        if (req.method !== "POST") {
            return res.status(405).json({ error: "Method Not Allowed" });
        }

        const { uniqueFileName, actualFileName, filePath } = await moveFileToServer(req);
        console.log("File moved to server:", actualFileName);

        await new Promise(resolve => setTimeout(resolve, 2000)); // Delay

        const response = await storeDataInBlockchain(actualFileName, uniqueFileName, filePath);
        console.log("IPFS hash stored in blockchain");

        return res.status(200).json(response);
    } catch (err) {
        console.error("API Error:", err.message);
        return res.status(500).json({ error: err.message || "Internal Server Error" });
    }
}

export default handler;
