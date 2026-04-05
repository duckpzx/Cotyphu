import dotenv from "dotenv";
dotenv.config();
import jwt from "jsonwebtoken";
import userRepo from "../repositories/user.repo.js";

const SECRET = process.env.JWT_SECRET;

const userService = {

  async register(username,email,password){
    const exist = await userRepo.findByUsername(username);

    if(exist){
      return {
        success:false,
        message:"Tài khoản đã tồn tại"
      };
    }

    const userId = await userRepo.register(
      username,
      email,
      password
    );

    return {
      success:true,
      userId
    };
  },

  async login(username, password){

    const result = await userRepo.login(username, password);

    if(!result){
      return {
        success:false,
        message:"Sai tài khoản hoặc mật khẩu"
      };
    }

    const { user } = result;

    const token = jwt.sign(
      { id: user.id },
      SECRET,
      { expiresIn: process.env.JWT_EXPIRES }
    );

    return {
      success: true,
      token,
      ...result
    };

  },

  async getUserById(user_id){
    return await userRepo.findById(user_id);
  }

};

export default userService;