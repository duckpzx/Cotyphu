import userRepo from "../repositories/user.repo.js";

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
      message:"Đăng ký thành công",
      userId
    };

  },

  // ===== LOGIN =====
  async login(username,password){

    const user = await userRepo.findByUsername(username);

    if(!user){
      return {
        success:false,
        message:"Tài khoản không tồn tại"
      };
    }

    if(user.password !== password){
      return {
        success:false,
        message:"Sai mật khẩu"
      };
    }

    return {
      success:true,
      message:"Đăng nhập thành công",
      user:user
    };

  }
  
};

export default userService;