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

    await characterRepo.setActiveCharacter(user_id, character_id);

    await characterRepo.setOldPlayer(user_id);

    return {
      success:true,
      message:"Tạo nhân vật thành công"
    };
  },

  async getCharactersByUser(user_id){

    return await characterRepo.getCharactersByUser(user_id);

  },

  async getOwnedCharactersForBag(user_id) {
    if (!user_id) {
      return {
        success: false,
        message: "Thiếu user_id",
        data: []
      };
    }

    const characters = await characterRepo.getOwnedCharactersForBag(user_id);

    return {
      success: true,
      data: characters
    };
  },

  async getOwnedSkinsForBag(user_id, character_id) {
    if (!user_id || !character_id) {
      return {
        success: false,
        message: "Thiếu dữ liệu",
        data: []
      };
    }

    const skins = await characterRepo.getOwnedSkinsForBag(user_id, character_id);

    return {
      success: true,
      data: skins
    };
  }
};

export default characterService;