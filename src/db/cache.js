let activeLeague = null;

export const setLeague = (league) => {
  activeLeague = league;
};

export const getLeague = () => {
  return activeLeague;
};
