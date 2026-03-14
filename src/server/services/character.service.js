import characterRepo from "../repositories/character.repo.js";

const characterService = {

  async getCharacters(){

    const characters = await characterRepo.getAllCharacters();

    return {
      success: true,
      characters
    };

  },

  async createCharacter(user_id, character_id, name){

    if(!user_id || !character_id || !name){
      return {
        success:false,
        message:"Thiếu dữ liệu"
      };
    }

    await characterRepo.updateUserName(user_id, name);

    await characterRepo.insertUserCharacter(user_id, character_id);

    return {
      success:true,
      message:"Tạo nhân vật thành công"
    };

  }

};

export default characterService;