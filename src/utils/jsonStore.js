const fs = require('fs');
const os = require('os');
const path = require('path');

const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const TMP_CONFIG_DIR = path.join(os.tmpdir(), 'elight-config');

function resolveReadablePath(filePath) {
  if (IS_SERVERLESS) {
    const tmpPath = path.join(TMP_CONFIG_DIR, path.basename(filePath));
    if (fs.existsSync(tmpPath)) return tmpPath;
  }
  return filePath;
}

function readJsonFile(filePath, fallback) {
  try {
    const target = resolveReadablePath(filePath);
    if (fs.existsSync(target)) {
      const raw = fs.readFileSync(target, 'utf8');
      if (raw && raw.trim()) return JSON.parse(raw);
    }
  } catch (err) {
    console.warn(`[jsonStore] read fallback for ${path.basename(filePath)}:`, err.message);
  }
  return typeof fallback === 'function' ? fallback() : JSON.parse(JSON.stringify(fallback));
}

function writeJsonFile(filePath, data) {
  const payload = JSON.stringify(data, null, 2);
  if (!IS_SERVERLESS) {
    try {
      fs.writeFileSync(filePath, payload, 'utf8');
      return true;
    } catch (err) {
      if (!['EROFS', 'EACCES', 'EPERM'].includes(err.code)) {
        console.warn(`[jsonStore] write warning for ${path.basename(filePath)}:`, err.message);
        return false;
      }
    }
  }

  try {
    if (!fs.existsSync(TMP_CONFIG_DIR)) {
      fs.mkdirSync(TMP_CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(path.join(TMP_CONFIG_DIR, path.basename(filePath)), payload, 'utf8');
    return true;
  } catch (err) {
    console.warn(`[jsonStore] tmp write warning for ${path.basename(filePath)}:`, err.message);
    return false;
  }
}

module.exports = {
  readJsonFile,
  writeJsonFile
};
