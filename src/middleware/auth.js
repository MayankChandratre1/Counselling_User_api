import jwt from 'jsonwebtoken';

const authMiddleware = (req, res, next) => {
  try {
    console.log(req.headers);

    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Authentication token required' });
    }

    const decoded = jwt.verify(token, process.env.USER_JWT);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid authentication token' });
  }
};

export default authMiddleware;
